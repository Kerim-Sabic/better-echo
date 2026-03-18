import React from 'react';
import HoralixAiResultsPanelBridge from './logic/HoralixAiResultsPanelBridge';

function getPanelModule({ extensionManager }) {
  return [
    {
      name: 'panelHoralixAiResults',
      iconName: 'tab-linear',
      iconLabel: 'AI',
      label: 'AI Results',
      component: () => (
        <HoralixAiResultsPanelBridge appConfig={extensionManager.appConfig} />
      ),
    },
  ];
}

export default getPanelModule;
