window.config = {
  routerBasename: "/",
  extensions: ["@horalix/extension-ai-panel"],
  modes: ["@horalix/mode-ai-results"],
  horalixAiBridge: {
    allowedParentOrigins: ["http://localhost:3000", "file://"],
    channel: "horalix-ai"
  },
  showStudyList: false,
  whiteLabeling: {
    createLogoComponentFn: function (React) {
      return React.createElement(React.Fragment, null);
    }
  },
  filterQueryParam: false,
  disableServersCache: false,
  defaultDataSourceName: "orthanc",
  dataSources: [
    {
      namespace: "@ohif/extension-default.dataSourcesModule.dicomweb",
      sourceName: "orthanc",
      configuration: {
        friendlyName: "Orthanc",
        name: "Orthanc",
        wadoUriRoot: "/dicom-web",
        qidoRoot: "/dicom-web",
        wadoRoot: "/dicom-web",
        qidoSupportsIncludeField: false,
        imageRendering: "wadors",
        thumbnailRendering: "wadors",
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        omitQuotationForMultipartRequest: true
      }
    }
  ],
  servers: {
    dicomWeb: [
      {
        name: "Orthanc",
        wadoUriRoot: "/dicom-web",
        qidoRoot: "/dicom-web",
        wadoRoot: "/dicom-web",
        qidoSupportsIncludeField: false,
        imageRendering: "wadors",
        thumbnailRendering: "wadors",
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false
      }
    ]
  }
};
