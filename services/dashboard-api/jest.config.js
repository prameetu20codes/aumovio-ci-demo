'use strict';

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  // No Babel transform: Test Intelligence can mis-map coverage through transformers.
  transform: {},
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageDirectory: 'reports/coverage',
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'reports',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        addFileAttribute: 'true',
      },
    ],
  ],
};
