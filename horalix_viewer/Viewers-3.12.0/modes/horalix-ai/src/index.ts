import i18n from 'i18next';
import { id } from './id';
import {
  initToolGroups,
  toolbarButtons,
  cornerstone,
  ohif,
  basicLayout,
  basicRoute,
  extensionDependencies as basicDependencies,
  mode as basicMode,
  modeInstance as basicModeInstance,
} from '@ohif/mode-basic';

const tracked = {
  measurements: '@ohif/extension-measurement-tracking.panelModule.trackedMeasurements',
  thumbnailList: '@ohif/extension-measurement-tracking.panelModule.seriesList',
  viewport: '@ohif/extension-measurement-tracking.viewportModule.cornerstone-tracked',
};

const horalix = {
  aiPanel: '@horalix/extension-ai-panel.panelModule.panelHoralixAiResults',
};

export const extensionDependencies = {
  ...basicDependencies,
  '@ohif/extension-measurement-tracking': '^3.0.0',
  '@horalix/extension-ai-panel': '^3.0.0',
};

export const horalixLayout = {
  ...basicLayout,
  id: ohif.layout,
  props: {
    ...basicLayout.props,
    leftPanels: [tracked.thumbnailList],
    rightPanels: [horalix.aiPanel, cornerstone.segmentation, tracked.measurements],
    rightPanelClosed: false,
    viewports: [
      {
        namespace: tracked.viewport,
        displaySetsToDisplay: basicLayout.props.viewports[0].displaySetsToDisplay,
      },
      ...basicLayout.props.viewports,
    ],
  },
};

export const horalixRoute = {
  ...basicRoute,
  path: 'longitudinal',
  layoutInstance: horalixLayout,
};

export const modeInstance = {
  ...basicModeInstance,
  id,
  routeName: 'viewer-ai',
  hide: true,
  displayName: i18n.t('Modes:Horalix AI Viewer'),
  routes: [horalixRoute],
  extensions: extensionDependencies,
};

const mode = {
  ...basicMode,
  id,
  modeInstance,
  extensionDependencies,
};

export default mode;
export { initToolGroups, toolbarButtons };
