import { describe, expect, it } from 'vitest';
import { assertProductUxReady, PRODUCT_UX_TARGET } from './product-ux-flags.js';
import {
  appBootstrapSuccess,
  appBindPipelineRun,
  createAppSession,
} from './app-session.js';

describe('W7.3 product UX evidence flags', () => {
  it('fails when chrome flags missing; passes after bootstrap+pipeline bind', () => {
    expect(() =>
      assertProductUxReady({
        explorerFromApi: false,
        pipelineFromRun: false,
        historyFromStore: false,
        scriptedAiWithoutKey: true,
        chromeBoundToPublication: false,
        hybridPanelsWired: false,
        dualEngineViewportCompare: false,
      }),
    ).toThrow(/Product UX incomplete/);

    let session = createAppSession();
    session = appBootstrapSuccess(
      session,
      {
        modelId: 'm1',
        branchId: 'b1',
        headHash: 'h1',
        explorerIds: ['y:1'],
        pipelineHash: 'pipe:abc',
        lengthMm: 2300,
      },
      1,
    );
    session = appBindPipelineRun(session, { pipelineHash: 'pipe:abc', parameters: { lengthMm: 2300 } });
    assertProductUxReady({
      explorerFromApi: session.liveBinding.explorerFromApi,
      pipelineFromRun: session.liveBinding.pipelineFromRun,
      historyFromStore: true,
      scriptedAiWithoutKey: PRODUCT_UX_TARGET.scriptedAiWithoutKey,
      chromeBoundToPublication: session.publicationStatus === 'candidate',
      hybridPanelsWired: PRODUCT_UX_TARGET.hybridPanelsWired,
      dualEngineViewportCompare: PRODUCT_UX_TARGET.dualEngineViewportCompare,
    });
  });
});
