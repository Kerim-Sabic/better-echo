// OHIF viewer runtime config for the AWS cloud trial deployment.
//
// Mirrors horalix_viewer/runtime_config/app-config.js but:
//   - Trusts the Electron client (file://) and any HTTPS parent origin, since
//     the public-facing tenant domain varies per deployment and the iframe is
//     hosted by the Electron client running on the doctor's laptop.
//   - Keeps DICOMweb paths relative so OHIF resolves them against its own
//     origin (https://${DOMAIN}/dicom-web/...), which the OHIF container's
//     nginx then proxies to orthanc:8042 on the internal compose network.
//
// Mounted into the horalix-viewer container at
// /usr/share/nginx/html/app-config.js via docker-compose.cloud.yml.
window.config = {
  routerBasename: "/",
  extensions: ["@horalix/extension-ai-panel"],
  modes: ["@horalix/mode-ai-results"],
  horalixAiBridge: {
    // Empty = trust whatever frame actually embeds this viewer. The bridge
    // still guards on event.source === window.parent, so only the real parent
    // (the doctor's Horalix client) can drive the panel. We can't use an
    // explicit allowlist here because the parent origin varies by build:
    // http://localhost:3000 in dev, https://<tenant> in a browser. The bridge's
    // isAllowedOrigin does exact matching (no wildcards), so the previous
    // ["file://","https://*"] list rejected every real parent and also threw on
    // the invalid "https://*" send target. Empty also makes the panel post back
    // with targetOrigin "*".
    allowedParentOrigins: [],
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
