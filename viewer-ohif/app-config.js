window.config = {
  routerBasename: "/",
  showStudyList: true,
  filterQueryParam: false,
  disableServersCache: false,
  servers: {
    dicomWeb: [
      {
        name: "Orthanc",
        wadoUriRoot: "http://localhost:3005/dicom-web",
        qidoRoot: "http://localhost:3005/dicom-web",
        wadoRoot: "http://localhost:3005/dicom-web",
        qidoSupportsIncludeField: false,
        imageRendering: "wadors",
        thumbnailRendering: "wadors",
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false
      }
    ]
  }
};
