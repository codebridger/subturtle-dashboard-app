# Vendored packages

## `modular-rest-server-2.0.0-firestore.1.tgz`

A build of `@modular-rest/server` ahead of its npm release, referenced from
`server/package.json` as `file:./vendor/…` (yarn.lock pins its hash). Source:
[modular-rest/modular-rest](https://github.com/modular-rest/modular-rest), branch
`claude/mongoose-8-firestore-single-db` at commit `d49ea69`, `packages/server-ts`.
Changes over 1.21.0:

- Mongoose 5 → 8 (MongoDB driver 6), which Firestore with MongoDB compatibility requires.
- `mongo.singleDatabase`: every logical database shares one connection and the one
  physical database named in `mongoBaseAddress` — Firestore exposes a single database per
  connection string, and its database IDs cannot contain underscores.
- Startup fails instead of hanging when the initial database connection fails.

Rebuild (the version override only names the build; the source keeps its own version):

```bash
cd modular-rest/packages/server-ts && yarn build
mkdir -p /tmp/mr-pack && cp -R dist docs README.md /tmp/mr-pack/
node -e "const p=require('./package.json'); p.version='2.0.0-firestore.N'; delete p.scripts; require('fs').writeFileSync('/tmp/mr-pack/package.json', JSON.stringify(p,null,'\t')+'\n')"
(cd /tmp/mr-pack && npm pack)   # then copy the .tgz here, update package.json, run yarn install
```

Switch back to the registry (`"@modular-rest/server": "^2.0.0"`) once that version is
published, and delete this directory.
