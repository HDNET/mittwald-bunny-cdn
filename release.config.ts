import hdnetConfig from '@hdnet/semantic-release-config'

export default {
  ...hdnetConfig,
  branches: [
    'main',
    {
      name: 'integration',
      channel: 'next',
      prerelease: true,
    },
  ],
}
