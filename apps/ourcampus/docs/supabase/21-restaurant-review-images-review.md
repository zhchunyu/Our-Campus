# Restaurant photo release review — 2026-11-13

## Recommendation

**Deployed on 2026-11-13.** The production migration `restaurant_review_private_photos` (version `20261113052010`) returned `success=true`. The complete transactional SQL regression returned `PASS`, and all synthetic fixture writes rolled back. Post-deployment preflight confirms the photo column, new RPC and validated array constraint are present; RLS and private-bucket checks are true, and direct review-write flags are false.

Post-deployment security advisors added only the expected authenticated definer RPC capability. That RPC checks `auth.uid()`, fixes `search_path` to empty and denies anonymous execution. Existing PostGIS/extension advisor findings remain unchanged.

[The reviewed additive migration](./21-restaurant-review-images.sql), [complete rollback regression](./21-restaurant-review-images-regression.sql) and [read-only preflight](./21-restaurant-review-images-preflight.sql) are recorded together here. Actual Storage HTTP upload/signing and phone file-selection/upload acceptance remain pending; SQL metadata tests do not establish those device and HTTP behaviors. These files follow the repository numbered SQL convention; no CLI migration timestamp was invented.

The initial security inspection used only schema/function/policy metadata and bucket configuration in project `hkdblizadnkskxslyjyq`. The subsequent deployment committed the additive schema change and the regression wrote only synthetic fixture rows inside a rolled-back transaction. Real user text, addresses, passwords, photo names and photo bytes were not queried by this review.

## Verified baseline and compatibility

- Before deployment, `restaurant_reviews` had no `image_paths` column and the photo RPC was absent. Both are now present, with the array constraint validated. Existing non-null text/rating/tag/price constraints, `(author_id, client_id)` uniqueness and the one-visible-review-per-window/author unique index remain intact.
- The text RPC has the seven-parameter signature and fixed empty `search_path`; it derives the author from `auth.uid()`, compares retried payloads and serializes submissions for that author. The withdrawal RPC checks author or manager. Both are granted to authenticated/service-role callers, with anonymous execution revoked.
- Reviews have RLS enabled. Anonymous and authenticated roles have only `SELECT`, limited to `status='visible'`. There are no direct review insert/update grants.
- `post-images` is private, limited to 5 MiB, and permits JPEG/PNG/WebP. Current INSERT policy checks an authenticated caller's UUID prefix. There is no Storage UPDATE/ALL policy. The existing owner/hall/report policy clauses from `18-community-images.sql` are preserved; deletion additionally checks restaurant references.
- The original DELETE policy did not mention restaurant reviews. The migration replaced that exact policy with the additional restaurant reference check rather than adding a second permissive rule that could be ORed away.
- The deployed legacy submit RPC definition fingerprint remains `d537e43a0aa0eb79fab20c091c69877b`; the withdrawal RPC remains `4af53b0f956563f8de2dffc2946cd8e5`. Their definitions were unchanged by the migration.

## Reviewed behavior

The old RPC is neither replaced nor overloaded. Its inserts receive the empty-array default, and its text-only idempotency behavior stays valid. The new RPC uses a separate name; old clients can read/withdraw a photo review and retry its matching text payload without clearing the saved photos. Existing aggregate views do not change.

The new API never accepts an author argument. Its authenticated author ID, owner-prefixed canonical JPEG paths, actual Storage metadata existence, maximum three distinct non-null paths, one-dimensional one-based array shape and immutable photo list are checked in the database. The trigger is private, has an empty `search_path`, and rejects use on an unexpected table. Its definer privilege is needed only to inspect Storage metadata without recursive parent RLS. Direct callers cannot execute it. The new RPC has an explicit `auth.uid()` gate, empty `search_path`, and narrow API grants.

The added CHECK starts `NOT VALID`, protecting new writes immediately, and is explicitly validated before commit. The migration has a five-second lock timeout and a sixty-second statement timeout. A failed prerequisite, lock wait, validation or DDL step rolls back the whole migration.

Photo reads are available to signed-in users when at least one visible review references the object, plus the existing owner/hall/report rules. Anonymous text reads remain available, but anonymous photo signing is not added. A photo shared by multiple visible reviews cannot be deleted while any visible review references it. Withdrawing a review stops fresh peer access through that review, while the owner still sees their own uploads.

The DELETE reference query intentionally runs under existing caller RLS: withdrawn reviews are invisible, so the owner may clean up their withdrawn uploads. References from visible hall/report parents still block deletion under the existing policies. Other users cannot delete these objects because the UUID prefix must match their authenticated ID. Storage upsert/update is not enabled.

## Limits that matter

- Our client asks for 300-second signed URLs. This is not a server-enforced maximum: a separately issued signed URL keeps its own expiry, and withdrawal cannot invalidate a URL already issued or a downloaded copy. Strict immediate revocation would require authenticated downloads or a controlled signing service, beyond this additive fix. See [Supabase private downloads and signed URL revocation](https://supabase.com/docs/guides/storage/serving/downloads).
- SQL regression proves metadata/RLS behavior, not JPEG upload, actual Storage HTTP signing, device file selection, image decode or rendering. Those require the smoke test below. Private bucket access and upsert behavior follow [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
- As in the existing community attachment feature, Storage objects have no database foreign key to parent paths. A caller deliberately racing deletion of their own unreferenced upload against publication could create a broken image reference. The client does not perform that concurrent cleanup. This does not allow another author to attach or delete the caller's photos; a future storage cleanup worker must serialize/check parent references rather than delete by age alone.

## Verification record and remaining acceptance

1. **Completed:** pre-deployment read-only preflight found the photo column/new RPC absent, old RPC count one, direct-write flags false and bucket/RLS checks true.
2. **Completed:** the atomic `restaurant_review_private_photos` migration returned `success=true`.
3. **Completed:** the entire `21-restaurant-review-images-regression.sql` ran as one fail-on-error call and returned `PASS` after rollback. It used only random synthetic accounts, three independent fixture windows and exact fixture Storage metadata, with no HTTP requests or existing user text. All fixture changes rolled back. For future runs, never execute individual DML fragments, remove the rollback, or resume at the final `SELECT` after an exception.
4. **Completed:** post-deployment preflight confirms photo column/new RPC/validated CHECK present, RLS/private bucket true, direct-write flags false, and unchanged old submit/withdraw RPC fingerprints.
5. **Pending:** with disposable app accounts, upload one and three JPEGs through the actual phone client, retry an interrupted publish, read from a second signed-in account, verify a foreign unreferenced object cannot be signed, then withdraw all review parents and confirm a **new** peer signing request is denied. Check a fresh browser/account state instead of reusing a previously signed URL. Remove only disposable fixture objects through Storage API after withdrawing their parents. This is the remaining real HTTP and phone upload acceptance boundary.
6. Independent review run: `restaurantCloudReviews.test.js`, `restaurantReviews.test.js` and `postImages.test.js`: **20 tests passed**. Build, package and client release results belong to the release record; these SQL results alone do not establish phone upload acceptance.

## Rollback

If the migration itself fails, its transaction restores all original objects automatically. If verification fails after commit, first roll back the client to the previous version; text-only clients remain compatible with the additive server change. Keep the new column, trigger, read policy and strengthened DELETE protection while investigating. Do not drop `image_paths`, restore the old weaker DELETE policy, or delete the bucket: those actions would discard photos or allow deletion of photos still referenced by published reviews.

For a confirmed new-RPC-only defect, revoke authenticated execution on `campus_submit_restaurant_review_with_images(uuid,uuid,text,integer,text,text[],numeric,text[])` and reload the API schema while the previous client serves text reviews. Existing attached reviews remain readable and withdrawable; new photo submissions fail clearly without silently dropping selected images. Restore that single grant after the fix. A full schema reversal should only occur after all attached reviews/objects have an explicit retention or removal decision.
