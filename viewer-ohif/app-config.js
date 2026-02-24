window.config = {
  routerBasename: "/",
  extensions: ["@horalix/extension-ai-panel"],
  modes: ["@horalix/mode-ai-results"],
  horalixAiBridge: {
    allowedParentOrigins: ["http://localhost:3000"],
    channel: "horalix-ai"
  },
  showStudyList: true,
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
        wadoUriRoot: "http://localhost:3001/dicom-web",
        qidoRoot: "http://localhost:3001/dicom-web",
        wadoRoot: "http://localhost:3001/dicom-web",
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
        wadoUriRoot: "http://localhost:3001/dicom-web",
        qidoRoot: "http://localhost:3001/dicom-web",
        wadoRoot: "http://localhost:3001/dicom-web",
        qidoSupportsIncludeField: false,
        imageRendering: "wadors",
        thumbnailRendering: "wadors",
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false
      }
    ]
  }
};
