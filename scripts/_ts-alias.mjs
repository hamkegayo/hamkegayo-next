// `--import ./scripts/_ts-alias.mjs` 로 붙여 쓰는 등록기. 훅 본체는 _ts-alias-hooks.mjs.
import { register } from "node:module";

register("./_ts-alias-hooks.mjs", import.meta.url);
