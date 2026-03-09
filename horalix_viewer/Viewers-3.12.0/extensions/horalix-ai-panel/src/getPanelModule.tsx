import React from 'react';

import HoralixAiResultsPanel from './Panels/HoralixAiResultsPanel';

function getPanelModule({ extensionManager }) {
  return [
    {
      name: 'panelHoralixAiResults',
      iconName: 'tab-linear',
      iconLabel: 'AI',
      label: 'AI Results',
      component: props => <HoralixAiResultsPanel {...props} appConfig={extensionManager.appConfig} />,
    },
  ];
}

export default getPanelModule;
