import { rollup_commpn_lib_config } from '@q-front-npm-configs/rollup';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const result = rollup_commpn_lib_config('http', {
    external: ['@q-front-npm/utils', '@q-front-npm/utils/extra', 'axios', 'lodash-es', 'qs']
}, pkg.version);

export default result;
