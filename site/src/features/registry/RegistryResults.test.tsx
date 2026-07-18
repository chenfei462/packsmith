import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { repositoryData } from '../../data/repositoryData'
import { filterPacks } from '../../data/selectors'
import { defaultSceneInput, sceneStore } from '../../experience/sceneStore'
import { renderAppRoute } from '../../test/render'

describe('Registry result synchronization', () => {
  beforeEach(() => {
    window.localStorage.clear()
    sceneStore.getState().setScene(defaultSceneInput)
    sceneStore.getState().completeTransition()
  })

  it('keeps the URL, DOM rows, and spatial scene in one stable order', async () => {
    const user = userEvent.setup()
    const { router } = renderAppRoute('/registry')

    await user.selectOptions(
      await screen.findByRole(
        'combobox',
        { name: /target runtime/i },
        { timeout: 3000 },
      ),
      'github-copilot',
    )

    const expectedIds = filterPacks(repositoryData.packs, {
      q: '',
      category: '',
      target: 'github-copilot',
      risk: '',
      sort: 'name',
    }).map((pack) => pack.id)

    expect(expectedIds).toHaveLength(30)
    await waitFor(() => {
      const rows = screen.getAllByTestId('registry-result')
      expect(rows).toHaveLength(30)
      expect(rows.map((row) => row.dataset.packId)).toEqual(expectedIds)
      expect(router.state.location.search).toBe('?target=github-copilot')
      expect(sceneStore.getState().active).toMatchObject({
        scene: 'registry',
        packIds: expectedIds,
      })
    })
  })

  it('changes only focusedPackId when a result link receives focus', async () => {
    renderAppRoute('/registry?target=github-copilot')
    const rows = await screen.findAllByTestId(
      'registry-result',
      undefined,
      { timeout: 3000 },
    )
    const focusedRow = rows[4]
    const activeBeforeFocus = sceneStore.getState().active
    const packIdsBeforeFocus =
      activeBeforeFocus.scene === 'registry'
        ? activeBeforeFocus.packIds
        : []

    fireEvent.focus(within(focusedRow).getByRole('link'))

    expect(sceneStore.getState().active).toMatchObject({
      scene: 'registry',
      focusedPackId: focusedRow.dataset.packId,
      packIds: packIdsBeforeFocus,
    })
  })
})
