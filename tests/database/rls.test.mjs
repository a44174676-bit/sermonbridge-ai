import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
process.loadEnvFile(".env.local");
if (
  process.env.SERMONBRIDGE_LOCAL_TEST !== "true" ||
  !process.env.TEST_DB_URL?.includes("@127.0.0.1:54329/")
)
  throw new Error("Tests require isolated local fixture");
const A = "10000000-0000-4000-8000-000000000001",
  B = "10000000-0000-4000-8000-000000000002",
  SA = "20000000-0000-4000-8000-000000000001",
  SB = "20000000-0000-4000-8000-000000000002";
const id = (name) => {
  const value = process.env[`TEST_${name}_ID`];
  if (!value) throw new Error("Run seed-test-users.mjs first");
  return value;
};
for (const n of ["ADMIN_A", "PASTOR_A", "MEDIA_A", "ADMIN_B", "OUTSIDER"])
  id(n);
async function asUser(name, fn) {
  const c = new Client({ connectionString: process.env.TEST_DB_URL });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      name ? "set local role authenticated" : "set local role anon",
    );
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
      name ? id(name) : "",
    ]);
    return await fn(c);
  } finally {
    await c.query("rollback");
    await c.end();
  }
}
const denied = (name, sql, params) =>
  assert.rejects(
    asUser(name, (c) => c.query(sql, params)),
    (e) => e.code === "42501",
  );
test("all seven tables have RLS enabled", async () => {
  const c = new Client({ connectionString: process.env.TEST_DB_URL });
  await c.connect();
  try {
    const { rows } = await c.query(
      "select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname=any($1)",
      [
        [
          "churches",
          "profiles",
          "church_memberships",
          "sermons",
          "sermon_sections",
          "translations",
          "reviews",
        ],
      ],
    );
    assert.equal(rows.length, 7);
    assert(rows.every((r) => r.relrowsecurity));
  } finally {
    await c.end();
  }
});
test("anonymous cannot read private sermons", () =>
  denied(null, "select source from public.sermons"));
test("A church sees A but not B sermons", () =>
  asUser("MEDIA_A", async (c) => {
    assert.equal(
      (await c.query("select id from public.sermons where id=$1", [SA]))
        .rowCount,
      1,
    );
    assert.equal(
      (await c.query("select id from public.sermons where id=$1", [SB]))
        .rowCount,
      0,
    );
  }));
test("A church cannot update B sermon", () =>
  asUser("ADMIN_A", async (c) => {
    assert.equal(
      (
        await c.query("update public.sermons set title=$1 where id=$2", [
          "forbidden",
          SB,
        ])
      ).rowCount,
      0,
    );
  }));
test("A cannot create a sermon under B", () =>
  denied(
    "MEDIA_A",
    "insert into public.sermons(church_id,title,source) values($1,$2,$3)",
    [B, "forbidden", "synthetic"],
  ));
test("source owner and church cannot be reassigned", () =>
  denied("ADMIN_A", "update public.sermons set church_id=$1 where id=$2", [
    B,
    SA,
  ]));
test("media cannot approve through RPC", () =>
  denied("MEDIA_A", "select public.review_sermon($1,1,'approved','')", [SA]));
test("media cannot bypass approval RPC with direct column update", () =>
  denied(
    "MEDIA_A",
    "update public.sermons set status='approved',approved_by=auth.uid(),approved_at=now() where id=$1",
    [SA],
  ));
test("admin cannot approve another church sermon", () =>
  denied("ADMIN_A", "select public.review_sermon($1,1,'approved','')", [SB]));
test("pastor can approve, edit revokes approval and preserves review audit", () =>
  asUser("PASTOR_A", async (c) => {
    await c.query("select public.review_sermon($1,1,'approved','검토 완료')", [
      SA,
    ]);
    assert.equal(
      (await c.query("select status from public.sermons where id=$1", [SA]))
        .rows[0].status,
      "approved",
    );
    await c.query("update public.sermons set source=$1 where id=$2", [
      "변경한 합성 원고",
      SA,
    ]);
    const s = (
      await c.query(
        "select status,revision,approved_by from public.sermons where id=$1",
        [SA],
      )
    ).rows[0];
    assert.equal(s.status, "draft");
    assert.equal(s.revision, 2);
    assert.equal(s.approved_by, null);
    assert.equal(
      (await c.query("select id from public.reviews where sermon_id=$1", [SA]))
        .rowCount,
      1,
    );
  }));
test("stale revision cannot be approved", () =>
  assert.rejects(
    asUser("PASTOR_A", (c) =>
      c.query("select public.review_sermon($1,999,'approved','')", [SA]),
    ),
    (e) => e.code === "40001",
  ));
test("reviews cannot be forged or edited", () =>
  denied(
    "ADMIN_A",
    "insert into public.reviews(church_id,sermon_id,reviewer_id,decision,revision) values($1,$2,auth.uid(),'approved',1)",
    [A, SA],
  ));
test("signup metadata admin does not grant church membership", () =>
  asUser("OUTSIDER", async (c) => {
    assert.equal((await c.query("select id from public.sermons")).rowCount, 0);
    assert.equal(
      (await c.query("select * from public.church_memberships")).rowCount,
      0,
    );
  }));
test("media cannot self-promote", () =>
  denied(
    "MEDIA_A",
    "select public.manage_membership($1,auth.uid(),'admin',true)",
    [A],
  ));
test("membership direct writes cannot bypass admin RPC", () =>
  denied(
    "ADMIN_A",
    "update public.church_memberships set role='admin' where user_id=$1",
    [id("MEDIA_A")],
  ));
test("admin cannot manage another church", () =>
  denied("ADMIN_A", "select public.manage_membership($1,$2,'media',true)", [
    B,
    id("OUTSIDER"),
  ]));
test("last administrator cannot be deactivated", () =>
  assert.rejects(
    asUser("ADMIN_A", (c) =>
      c.query("select public.manage_membership($1,auth.uid(),'media',false)", [
        A,
      ]),
    ),
    (e) => e.code === "23514",
  ));
test("admin can add a pastor and revoke membership immediately", () =>
  asUser("ADMIN_A", async (c) => {
    await c.query("select public.manage_membership($1,$2,'pastor',true)", [
      A,
      id("OUTSIDER"),
    ]);
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
      id("OUTSIDER"),
    ]);
    assert.equal(
      (await c.query("select id from public.sermons where id=$1", [SA]))
        .rowCount,
      1,
    );
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
      id("ADMIN_A"),
    ]);
    await c.query("select public.manage_membership($1,$2,'pastor',false)", [
      A,
      id("OUTSIDER"),
    ]);
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
      id("OUTSIDER"),
    ]);
    assert.equal(
      (await c.query("select id from public.sermons where id=$1", [SA]))
        .rowCount,
      0,
    );
  }));
test("section and translation edits invalidate approval", () =>
  asUser("PASTOR_A", async (c) => {
    const section = (
      await c.query(
        "insert into public.sermon_sections(church_id,sermon_id,position,content,content_kind) values($1,$2,1,'합성 문장','source') returning id",
        [A, SA],
      )
    ).rows[0].id;
    const version = (
      await c.query("select revision from public.sermons where id=$1", [SA])
    ).rows[0].revision;
    await c.query("select public.review_sermon($1,$2,'approved','')", [
      SA,
      version,
    ]);
    await c.query(
      "insert into public.translations(church_id,sermon_id,section_id,language,content) values($1,$2,$3,'en','Synthetic text')",
      [A, SA, section],
    );
    assert.equal(
      (await c.query("select status from public.sermons where id=$1", [SA]))
        .rows[0].status,
      "draft",
    );
  }));
test("cross-church child row linkage is rejected by composite foreign key", () =>
  assert.rejects(
    asUser("MEDIA_A", (c) =>
      c.query(
        "insert into public.sermon_sections(church_id,sermon_id,position,content,content_kind) values($1,$2,1,'synthetic','source')",
        [A, SB],
      ),
    ),
    (e) => e.code === "23503",
  ));
test("anonymous still cannot read an approved sermon", () =>
  asUser("PASTOR_A", async (c) => {
    await c.query("select public.review_sermon($1,1,'approved','')", [SA]);
    await c.query("set local role anon");
    await assert.rejects(
      c.query("select source from public.sermons where id=$1", [SA]),
      (e) => e.code === "42501",
    );
  }));

test("A cannot read B sections, translations, reviews or church metadata", () =>
  asUser("ADMIN_B", async (c) => {
    const section = (
      await c.query(
        "insert into public.sermon_sections(church_id,sermon_id,position,content,content_kind) values($1,$2,1,'B synthetic text','source') returning id",
        [B, SB],
      )
    ).rows[0].id;
    await c.query(
      "insert into public.translations(church_id,sermon_id,section_id,language,content) values($1,$2,$3,'en','B synthetic translation')",
      [B, SB, section],
    );
    const version = (
      await c.query("select revision from public.sermons where id=$1", [SB])
    ).rows[0].revision;
    await c.query(
      "select public.review_sermon($1,$2,'approved','B synthetic review')",
      [SB, version],
    );
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
      id("ADMIN_A"),
    ]);
    for (const table of [
      "sermon_sections",
      "translations",
      "reviews",
      "church_memberships",
    ])
      assert.equal(
        (await c.query(`select * from public.${table} where church_id=$1`, [B]))
          .rowCount,
        0,
      );
    assert.equal(
      (await c.query("select * from public.churches where id=$1", [B]))
        .rowCount,
      0,
    );
  }));
test("anonymous has no SELECT grant on any application table", async () => {
  for (const table of [
    "churches",
    "profiles",
    "church_memberships",
    "sermons",
    "sermon_sections",
    "translations",
    "reviews",
  ])
    await denied(null, `select * from public.${table}`);
});
