"use strict";

import { URL } from "node:url";
import { getLogger } from "./log.mjs";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 30_000;
const DEFAULT_MAX_RESPONSE_SIZE = 100 * 1024 * 1024;
const GITHUB_HOSTS = new Set(["api.github.com", "raw.githubusercontent.com"]);

class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "TimeoutError";
  }
}

class TotalBudgetExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = "TotalBudgetExceededError";
  }
}

class ResponseTooLargeError extends Error {
  constructor(message) {
    super(message);
    this.name = "ResponseTooLargeError";
  }
}

function validateFiniteNumber(value, name, { minimum = 0, allowNull = false } = {}) {
  if (value === null) {
    if (allowNull) {
      return;
    }
    throw new TypeError(`${name} must be a finite number.`);
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be ${allowNull ? "a finite number or null" : "a finite number"}.`);
  }

  if (value < minimum) {
    throw new TypeError(`${name} must be at least ${minimum}.`);
  }
}

function validateUrlHost(inputUrl, { allowHttp = false } = {}) {
  if (typeof inputUrl !== "string" || inputUrl.trim().length === 0) {
    throw new TypeError("URL must be a non-empty string.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(inputUrl);
  } catch {
    throw new TypeError(`Invalid URL: ${inputUrl}`);
  }

  // Operator-configured hosts (PACKSMITH_ALLOWED_FETCH_HOSTS) may use plain
  // HTTP — internal mirrors and local test servers are commonly unencrypted.
  const envAllowedHosts = (process.env.PACKSMITH_ALLOWED_FETCH_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const httpAllowed = allowHttp || envAllowedHosts.includes(parsedUrl.hostname.toLowerCase());

  if (parsedUrl.protocol !== "https:" && !httpAllowed) {
    throw new Error(`URL must use HTTPS: ${inputUrl}`);
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new TypeError(`URL must not include credentials: ${inputUrl}`);
  }

  return parsedUrl;
}

function validateGitHubUrlHost(inputUrl) {
  const parsedUrl = validateUrlHost(inputUrl);
  const hostname = parsedUrl.hostname.toLowerCase();

  if (!GITHUB_HOSTS.has(hostname)) {
    throw new Error(
      `Host ${hostname} is not in the allowed whitelist: ${Array.from(GITHUB_HOSTS).join(", ")}`
    );
  }

  return parsedUrl;
}

/**
 * Host allowlist for GitHub-source fetches (#1). Defaults to the official
 * GitHub API/raw hosts; operators can extend it (e.g. for internal mirrors or
 * local test servers) via PACKSMITH_ALLOWED_FETCH_HOSTS, a comma-separated
 * host list. Allow-listed non-GitHub hosts may use plain HTTP (mirrors and
 * mocks are commonly unencrypted); GitHub hosts always require HTTPS.
 */
function validateGitHubFetchUrl(inputUrl) {
  const parsedUrl = validateUrlHost(inputUrl, { allowHttp: true });
  const hostname = parsedUrl.hostname.toLowerCase();
  const extraHosts = (process.env.PACKSMITH_ALLOWED_FETCH_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  if (GITHUB_HOSTS.has(hostname)) {
    if (parsedUrl.protocol !== "https:") {
      throw new Error(`URL must use HTTPS: ${inputUrl}`);
    }
    return parsedUrl;
  }

  if (extraHosts.includes(hostname)) {
    return parsedUrl;
  }

  throw new Error(
    `Host ${hostname} is not in the allowed whitelist: ${Array.from(GITHUB_HOSTS).join(", ")}. ` +
      "Set PACKSMITH_ALLOWED_FETCH_HOSTS to allow additional hosts."
  );
}

function getBackoffDelay(attempt, baseDelayMs = DEFAULT_BASE_DELAY_MS) {
  const exponentialDelay = Math.min(baseDelayMs * 2 ** attempt, DEFAULT_MAX_BACKOFF_MS);
  const jitter = (Math.random() - 0.5) * 0.5 * exponentialDelay;
  return Math.max(100, Math.min(DEFAULT_MAX_BACKOFF_MS, exponentialDelay + jitter));
}

function assertBudget(elapsedMs, totalBudgetMs) {
  if (totalBudgetMs !== null && elapsedMs >= totalBudgetMs) {
    throw new TotalBudgetExceededError(
      `Total budget of ${totalBudgetMs}ms exceeded before fetching URL.`
    );
  }
}

function isRetryableStatus(status, retryableStatuses) {
  return retryableStatuses.has(status);
}

/**
 * An exhausted HTTP status failure. Tagged with a name so the retry loop's
 * catch treats it as final instead of retrying a status it already gave up on.
 */
function httpStatusError(response, suffix) {
  const error = new Error(`HTTP ${response.status} ${response.statusText}`.trim() + suffix);
  error.name = "HttpStatusError";
  error.status = response.status;
  return error;
}

function isNonRetryableNetworkError(error) {
  return (
    error?.name === "AbortError" ||
    error?.name === "TimeoutError" ||
    error?.name === "TotalBudgetExceededError" ||
    error?.name === "ResponseTooLargeError" ||
    // A final HTTP status failure (e.g. "HTTP 503 ...") has already exhausted
    // its retries or was configured with maxRetries 0; retrying it again here
    // would swallow the real status behind a generic "unexpected error".
    error?.name === "HttpStatusError"
  );
}

async function cancelResponseBody(response) {
  if (!response.body) {
    return;
  }

  try {
    await response.body.cancel();
  } catch {
    // The retry is more important than releasing a discarded response body.
  }
}

async function waitForRetry(attempt, state) {
  const delayMs = getBackoffDelay(attempt, state.baseDelayMs);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  assertBudget(Date.now() - state.startedAtMs, state.totalBudgetMs);
}

async function readResponseBody(response, options) {
  const { maxResponseSize, totalBudgetMs, timeoutMs } = options;
  const chunks = [];
  let totalSize = 0;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const budgetId =
    totalBudgetMs === null
      ? null
      : setTimeout(() => controller.abort(), totalBudgetMs);

  try {
      const reader = response.body?.getReader();
      if (!reader) {
        return Buffer.alloc(0);
      }

      while (true) {
        const readPromise = reader.read();
        let timeoutPromiseId;
        const timeoutPromise = new Promise((resolve, reject) => {
          const id = setTimeout(() => reject(new TimeoutError(`Response body timed out after ${timeoutMs}ms.`)), timeoutMs);
          timeoutPromiseId = id;
        });
        let budgetPromiseId;
        const budgetPromise =
          totalBudgetMs === null
            ? null
            : new Promise((resolve, reject) => {
                const id = setTimeout(
                  () => reject(new TotalBudgetExceededError(`Total budget of ${totalBudgetMs}ms exceeded while reading response.`)),
                  totalBudgetMs
                );
                budgetPromiseId = id;
              });

        let result;
        try {
          result = await Promise.race([readPromise, timeoutPromise, ...(budgetPromise ? [budgetPromise] : [])]);
        } finally {
          clearTimeout(timeoutPromiseId);
          clearTimeout(budgetPromiseId);
        }

        if (result.done) {
          break;
        }

        const chunk = Buffer.from(result.value);
        totalSize += chunk.length;
        if (totalSize > maxResponseSize) {
          throw new ResponseTooLargeError(
            `Response too large: ${totalSize} bytes (max: ${maxResponseSize})`
          );
        }

        chunks.push(chunk);
      }

    return Buffer.concat(chunks, totalSize);
  } finally {
    clearTimeout(timeoutId);
    clearTimeout(budgetId);
    if (controller.signal.aborted) {
      try {
        await reader.cancel();
      } catch {
        // The reader is being discarded after a timeout or budget failure.
      }
    }
  }
}

async function fetchWithTimeout(inputUrl, options = {}) {
  validateUrlHost(inputUrl, { allowHttp: options.allowHttp === true });

  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    totalBudgetMs = null,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryableStatuses = new Set([429, 500, 501, 502, 503, 504, 505]),
    maxResponseSize = DEFAULT_MAX_RESPONSE_SIZE,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    headers = {}
  } = options;

  validateFiniteNumber(timeoutMs, "timeoutMs", { minimum: 1 });
  validateFiniteNumber(totalBudgetMs, "totalBudgetMs", { minimum: 1, allowNull: true });
  validateFiniteNumber(maxRetries, "maxRetries", { minimum: 0 });
  validateFiniteNumber(maxResponseSize, "maxResponseSize", { minimum: 1 });
  validateFiniteNumber(baseDelayMs, "baseDelayMs", { minimum: 0 });

  if (!(retryableStatuses instanceof Set)) {
    throw new TypeError("retryableStatuses must be a Set.");
  }

  const state = {
    startedAtMs: Date.now(),
    totalBudgetMs,
    baseDelayMs
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    assertBudget(Date.now() - state.startedAtMs, state.totalBudgetMs);
    const controller = new AbortController();
    let timedOut = false;
    let budgetExpired = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const budgetId =
      state.totalBudgetMs === null
        ? null
        : setTimeout(() => {
            budgetExpired = true;
            controller.abort();
          }, state.totalBudgetMs);

    const log = getLogger();
    if (attempt === 0) {
      log?.info(`Request: ${inputUrl}`);
    }

    try {
      const response = await fetch(inputUrl, {
        signal: controller.signal,
        headers: {
          accept: "application/vnd.github+json, application/json",
          "x-github-api-version": "2022-11-28",
          ...headers
        }
      });

      clearTimeout(timeoutId);
      clearTimeout(budgetId);

      const elapsed = Date.now() - state.startedAtMs;
      if (attempt > 0) {
        log?.info(`Request succeeded after ${attempt} retries (${elapsed}ms): ${inputUrl}`);
      } else {
        log?.info(`Request completed in ${elapsed}ms: ${inputUrl}`);
      }
      if (log) log.incr("http.requests");
      if (attempt > 0) {
        if (log) log.incr("http.retries");
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength !== null) {
        const declaredSize = Number(contentLength);
        if (Number.isFinite(declaredSize) && declaredSize > maxResponseSize) {
          throw new ResponseTooLargeError(
            `Response too large: ${contentLength} bytes (max: ${maxResponseSize})`
          );
        }
      }

      if (!response.ok && isRetryableStatus(response.status, retryableStatuses)) {
        if (attempt === maxRetries) {
          throw httpStatusError(response, maxRetries > 0 ? ` after ${maxRetries} retries` : "");
        }
        const elapsed = Date.now() - state.startedAtMs;
        log?.info(`Retryable status ${response.status} (${elapsed}ms), retrying attempt ${attempt + 1}/${maxRetries}: ${inputUrl}`);
        await cancelResponseBody(response);
        await waitForRetry(attempt, state);
        continue;
      }

      if (!response.ok) {
        throw httpStatusError(response, "");
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      clearTimeout(budgetId);

      if (timedOut) {
        const elapsed = Date.now() - state.startedAtMs;
        throw new TimeoutError(`Request timed out after ${timeoutMs}ms: ${inputUrl}`);
      }

      if (budgetExpired) {
        const elapsed = Date.now() - state.startedAtMs;
        throw new TotalBudgetExceededError(
          `Total budget of ${state.totalBudgetMs}ms exceeded while fetching URL.`
        );
      }

      if (isNonRetryableNetworkError(error)) {
        const elapsed = Date.now() - state.startedAtMs;
        log?.info(`Non-retryable network error after ${attempt} attempts (${elapsed}ms): ${inputUrl} - ${error.message}`);
        throw error;
      }

      const elapsed = Date.now() - state.startedAtMs;
      log?.info(`Request failed (${elapsed}ms), retrying attempt ${attempt + 1}/${maxRetries}: ${inputUrl} - ${error.message}`);
      await waitForRetry(attempt, state);
    }
  }

  throw new Error("Unexpected error in fetchWithTimeout.");
}

// readResponseBody needs the same defaults fetchWithTimeout applies to its own
// destructuring, or timeoutMs/totalBudgetMs are undefined and their timers fire
// immediately — which only went unnoticed because small buffered responses won
// the race against a 0ms timer. Large bodies (e.g. github-archive archives)
// need a real timeout window.
function resolveResponseBodyOptions(options) {
  return {
    maxResponseSize: options.maxResponseSize ?? DEFAULT_MAX_RESPONSE_SIZE,
    totalBudgetMs: options.totalBudgetMs ?? null,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  };
}

async function fetchJsonWithTimeout(inputUrl, options = {}) {
  const response = await fetchWithTimeout(inputUrl, options);
  const body = await readResponseBody(response, resolveResponseBodyOptions(options));

  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch (error) {
    throw new TypeError(`Invalid JSON response from ${inputUrl}: ${error.message}`);
  }
}

async function fetchBytesWithTimeout(inputUrl, options = {}) {
  const response = await fetchWithTimeout(inputUrl, options);
  return readResponseBody(response, resolveResponseBodyOptions(options));
}

export {
  fetchWithTimeout,
  fetchJsonWithTimeout,
  fetchBytesWithTimeout,
  validateUrlHost,
  validateGitHubUrlHost,
  validateGitHubFetchUrl,
  TimeoutError,
  TotalBudgetExceededError,
  ResponseTooLargeError
};
