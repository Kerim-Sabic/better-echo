import React from 'react';
import HoralixAiResultsPanelBridge from './logic/HoralixAiResultsPanelBridge';

function getPanelModule({ servicesManager, extensionManager }) {
  return [
    {
      name: 'panelHoralixAiResults',
      iconName: 'tab-linear',
      iconLabel: 'AI',
      label: 'AI Results',
      component: () => (
        <HoralixAiResultsPanelBridge
          appConfig={extensionManager.appConfig}
          servicesManager={servicesManager}
        />
      ),
    },
  ];
}

export default getPanelModule;
