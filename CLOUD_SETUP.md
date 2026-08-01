# v1.4 雲端帳號、跨裝置存檔與教師後台設定

遊戲在沒有設定後端時仍會完整使用本機存檔。正式啟用帳號功能時，採用 Supabase Auth、Postgres、Row Level Security（RLS）與 revision 衝突檢查。

## 1. 建立資料庫

1. 建立 Supabase 專案。
2. 在 SQL Editor 執行 [`supabase/migrations/20260801_v13_cloud_saves.sql`](supabase/migrations/20260801_v13_cloud_saves.sql)。
3. 接著執行 [`supabase/migrations/20260801_v14_teacher_mvp.sql`](supabase/migrations/20260801_v14_teacher_mvp.sql)。
4. 最後執行 [`supabase/migrations/20260801_v15_island_spaces.sql`](supabase/migrations/20260801_v15_island_spaces.sql)，讓雲端接受 schema 11 的土地與空間進度。
5. 接著執行 [`supabase/migrations/20260801_v151_release_hardening.sql`](supabase/migrations/20260801_v151_release_hardening.sql)，啟用伺服器校時、學習事件紀錄與 schema 12。
6. 在 Table Editor 確認 `game_saves`、`game_profiles`、`game_classes`、`game_class_members`、`game_assignments`、`game_assignment_submissions` 與 `game_learning_events` 都已啟用 RLS。

Migration 只允許登入玩家讀取自己有權限查看的資料；所有存檔與教師後台寫入都經安全 RPC 驗證身分。學生不能自行升級為教師，也不能替別人回報進度或驗收作業；教師只能管理自己建立的班級。

## 2. 設定教師帳號

教師先用遊戲登入一次，讓系統建立 `game_profiles`。接著由專案管理員在 Supabase SQL Editor 執行下列指令；請把 Email 換成實際教師帳號：

```sql
update public.game_profiles
set role = 'teacher', updated_at = timezone('utc', now())
where user_id = (
  select id from auth.users where email = 'teacher@example.com'
);
```

這項操作必須由可信任的管理員完成，前端不提供教師權限申請或自助升級。

## 3. 啟用登入方式

- Email / Password：Supabase Dashboard → Authentication → Providers → Email。若啟用 Confirm email，玩家註冊後需先點信箱驗證連結。
- Google：先在 Google Cloud 建立 OAuth 2.0 Web Client，再到 Supabase Authentication → Providers → Google 填入 Client ID 與 Client Secret。
- Site URL 與 Redirect URLs 必須加入正式遊戲的精確 HTTPS 網址；本機測試網址也需另外列入 allow list。

Google Client Secret 只填在 Supabase Dashboard，不能放進前端檔案。

## 4. 設定前端

編輯 [`js/cloudConfig.js`](js/cloudConfig.js)：

```js
window.SENLOOP_CLOUD_CONFIG = Object.freeze({
  url: "https://YOUR_PROJECT.supabase.co",
  publishableKey: "YOUR_PUBLISHABLE_KEY",
  googleEnabled: true,
  autoSync: true,
  requestTimeoutMs: 12000
});
```

只可使用 Supabase 的 publishable key（舊專案可使用 anon key）。不可把 `service_role`、secret key、Google Client Secret 或玩家密碼寫進前端。

GitHub Pages 正式部署不需要修改原始檔，請在 repository settings 設定：

- Actions variable `SENLOOP_SUPABASE_URL`
- Actions secret `SENLOOP_SUPABASE_PUBLISHABLE_KEY`
- Actions variable `SENLOOP_GOOGLE_ENABLED`（`true` 或 `false`）

正式建置會把這三個值寫入 `dist/js/cloudConfig.js`，未設定時帳號功能會保持停用，但本機存檔仍可正常遊玩。

## 5. 部署與驗收

1. 以 HTTPS 部署遊戲。`file://` 可繼續本機遊玩，但不能完成 Google OAuth。
2. 分別在電腦與手機開啟正式網址，用同一帳號登入。
3. 裝置 A 改變資源後按「立即同步」，裝置 B 重新登入或同步，確認進度更新。
4. 兩台裝置離線各自產生新進度，再同時上線，確認顯示本機／雲端比較選擇，而不是直接覆蓋。
5. 登出後確認本機存檔仍保留；重新登入後確認可恢復雲端存檔。
6. 教師建立班級並分享六位代碼；學生加入後，確認教師班級總覽出現該學生。
7. 教師派發關卡、答題數或訂正數作業；學生達標後應自動送驗，教師可標記「通過」或「退回訂正」。
8. 分別以桌機、手機直向／橫向與平板開啟班級中心，確認作業表格可捲動且操作列不會遮擋內容。
9. 在工作台依序擴張兩階土地，進入小屋、實驗室與回收場；重新登入另一台裝置後，確認土地、研究與每日互動紀錄仍一致。

測試模式 `?test=1&qaCloud=1` 只會使用瀏覽器 localStorage 內的模擬雲端，不會連到 Supabase，也不應作為正式服務使用。人工測試教師畫面時可額外加入 `&qaTeacher=1`；此參數只有在測試模式與模擬雲端同時啟用時才有效。
