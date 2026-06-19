const { execSync } = require('node:child_process');

function detectBranch() {
    if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', {
            stdio: ['ignore', 'pipe', 'ignore'],
        })
            .toString()
            .trim();
    } catch {
        return 'main';
    }
}

const isDev = detectBranch() === 'dev';
const changelogFile = isDev ? 'CHANGELOG-DEV.md' : 'CHANGELOG.md';

module.exports = {
    branches: ['main', { name: 'dev', prerelease: true }],
    plugins: [
        '@semantic-release/commit-analyzer',
        '@semantic-release/release-notes-generator',
        ['@semantic-release/changelog', { changelogFile }],
        ['@semantic-release/npm', { npmPublish: false }],
        [
            '@semantic-release/git',
            {
                assets: ['package.json', changelogFile],
                message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
            },
        ],
        '@semantic-release/github',
    ],
};
