const path = require('path');

module.exports = {
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  jest: {
    configure: jestConfig => {
      jestConfig.moduleNameMapper = {
        ...(jestConfig.moduleNameMapper || {}),
        '^@/(.*)$': '<rootDir>/src/$1',
      };
      return jestConfig;
    },
  },
};
