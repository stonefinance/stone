import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: '../indexer/src/api/schema.graphql',
  documents: ['lib/graphql/**/*.ts', '!lib/graphql/generated/**/*'],
  generates: {
    './lib/graphql/generated/': {
      preset: 'client',
      plugins: [],
      presetConfig: {
        gqlTagName: 'gql',
      },
    },
    './lib/graphql/generated/hooks.ts': {
      plugins: [
        'typescript',
        'typescript-operations',
        'typescript-react-apollo',
      ],
      config: {
        withHooks: true,
        withHOC: false,
        withComponent: false,
        apolloClientVersion: 4,
        apolloReactHooksImportFrom: '@apollo/client/react/hooks',
        apolloClientImportFrom: '@apollo/client/core',
        gqlImport: '@apollo/client/core#gql',
        scalars: {
          DateTime: 'string',
          BigInt: 'string',
          Decimal: 'string',
          JSON: 'Record<string, unknown>',
        },
      },
    },
  },
  ignoreNoDocuments: true,
};

export default config;
