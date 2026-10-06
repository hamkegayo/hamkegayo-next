// 파트너 활동 지역 시드 생성 (#226)
//
// 원본: 국토교통부_전국 법정동 (공공데이터포털 15063424) CSV
//   컬럼: 법정동코드,시도명,시군구명,읍면동명,리명,순번,생성일자
// 사용: node scripts/build-activity-regions.mjs <법정동.csv> > regions.sql
//
// 계층: 1 시·도 → 2 시·군·구 → 3 일반구(수원시 장안구 등) → 4 읍·면·동. 리는 넣지 않는다.
// 상위 지역 선택은 하위 전체를 뜻한다. 수원시(41110)와 장안구(41111)처럼 코드 앞자리만으로는
// 포함 관계가 안 나오므로 ancestors(상위 코드 목록)를 함께 만든다.
// 행정구역이 개편되면 새 CSV로 이 스크립트를 다시 돌려 새 마이그레이션을 만든다.

import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
    console.error("사용: node scripts/build-activity-regions.mjs <법정동.csv>");
    process.exit(1);
}

const lines = readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/);
const header = lines.shift().split(",");
const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`컬럼 없음: ${name}`);
    return i;
};
const [CODE, SIDO, SGG, EMD, RI] = [
    "법정동코드",
    "시도명",
    "시군구명",
    "읍면동명",
    "리명",
].map(col);

const rows = lines
    .filter(Boolean)
    .map((l) => l.split(","))
    .filter((c) => !c[RI]);

const byCode = new Map();
const sidoRows = rows.filter((c) => !c[SGG] && !c[EMD]);
const sggRows = rows.filter((c) => c[SGG] && !c[EMD]);
const emdRows = rows.filter((c) => c[EMD]);

for (const c of sidoRows) {
    byCode.set(c[CODE], {
        code: c[CODE],
        level: 1,
        parent: null,
        name: c[SIDO],
        full: c[SIDO],
    });
}

// 일반구: 같은 시·도에 "○○시" 행이 있고 이름이 "○○시" + "…구" 인 행 (예: 수원시장안구).
// 코드 앞자리로 판별하면 증평군·영동군처럼 무관한 군이 묶이므로 이름으로 판별한다.
for (const c of sggRows) {
    const sido = `${c[CODE].slice(0, 2)}00000000`;
    const cityRow = sggRows.find(
        (x) =>
            x[SIDO] === c[SIDO] &&
            x[CODE] !== c[CODE] &&
            x[SGG].endsWith("시") &&
            c[SGG].startsWith(x[SGG]) &&
            c[SGG].slice(x[SGG].length).endsWith("구"),
    );
    if (cityRow) {
        const city = cityRow[CODE];
        const cityName = cityRow[SGG];
        const gu = c[SGG].slice(cityName.length);
        byCode.set(c[CODE], {
            code: c[CODE],
            level: 3,
            parent: city,
            name: gu,
            full: `${c[SIDO]} ${cityName} ${gu}`,
        });
    } else {
        byCode.set(c[CODE], {
            code: c[CODE],
            level: 2,
            parent: sido,
            name: c[SGG],
            full: `${c[SIDO]} ${c[SGG]}`,
        });
    }
}

for (const c of emdRows) {
    const parent = `${c[CODE].slice(0, 5)}00000`;
    const p = byCode.get(parent);
    if (!p) throw new Error(`상위 시·군·구 없음: ${c[CODE]} ${c[EMD]}`);
    byCode.set(c[CODE], {
        code: c[CODE],
        level: 4,
        parent,
        name: c[EMD],
        full: `${p.full} ${c[EMD]}`,
    });
}

function ancestors(r) {
    const out = [];
    for (let p = r.parent; p; p = byCode.get(p).parent) out.unshift(p);
    return out;
}

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const all = [...byCode.values()];
const counts = [1, 2, 3, 4].map((l) => all.filter((r) => r.level === l).length);
console.error(
    `시·도 ${counts[0]} / 시·군·구 ${counts[1]} / 일반구 ${counts[2]} / 읍·면·동 ${counts[3]}`,
);

// 원본 CSV 순서(행정 코드 순)를 그대로 정렬 순서로 쓴다.
console.log(
    all
        .map(
            (r, i) =>
                `(${q(r.code)},${r.level},${r.parent ? q(r.parent) : "null"},${q(r.name)},${q(r.full)},array[${ancestors(r).map(q).join(",")}]::text[],${i + 1})`,
        )
        .join(",\n"),
);
