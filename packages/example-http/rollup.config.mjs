import { rollup_commpn_lib_config } from '@q-front-npm-configs/rollup';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkg = require('./package.json');
const bundleName = pkg.name.slice(pkg.name.lastIndexOf('/') + 1);

const result = rollup_commpn_lib_config({name: bundleName, input: './generated/index.ts'}, {
    external: ['@protobuf-ts/runtime-http', '@protobuf-ts/runtime-rpc', '@protobuf-ts/runtime']
}, pkg.version);

export default result;
