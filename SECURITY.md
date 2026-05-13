# Security Policy

## Supported scope

Packsmith is a local CLI for validating, building, and installing agent skill packs.

Security-relevant areas include:

- filesystem writes during install, uninstall, build, and smoke flows
- path resolution and target directory handling
- metadata used for scoped Claude Code installs
- anything that could overwrite user files outside the intended install roots

This repository does not currently provide a hosted service, remote execution environment, or network API.

## Reporting a vulnerability

If you believe you found a security issue, do not open a public GitHub issue first.

Instead, email the maintainer at `chenfei462@outlook.com` with:

- a short description of the issue
- affected files, commands, or flows
- reproduction steps or a proof of concept
- impact assessment if known

I will acknowledge receipt as soon as practical and work toward a fix before public disclosure.

## What to include

Useful reports usually include:

- the exact command used
- the expected behavior
- the actual behavior
- operating system and Node version
- whether the issue requires a crafted pack, symlink, or unusual filesystem state

## Disclosure expectations

Please give the project a reasonable chance to reproduce and patch the issue before publishing details.

Once the issue is fixed, I prefer a public write-up or advisory entry so downstream users can understand the risk and upgrade path.
