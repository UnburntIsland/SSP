/* ============================================================
   education.js — v1.4 教師後台 MVP
   班級代碼、派作業、自動送驗、教師驗收與班級總覽。
   正式環境使用 Supabase RLS/RPC；?test=1&qaCloud=1 使用隔離模擬資料。
   ============================================================ */
(function (global) {
  var MOCK_KEY = "senloop_mock_education_v1";
  var REPORT_DELAY = 1200;

  function record(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { try { return JSON.parse(JSON.stringify(value)); } catch (error) { return null; } }
  function readJson(key, fallback) {
    try { var raw = global.localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (error) { return fallback; }
  }
  function writeJson(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { return false; }
  }
  function nowIso() { return new Date().toISOString(); }
  function clean(value, max) { return String(value || "").trim().slice(0, max || 300); }
  function educationError(error) {
    var message = error && (error.message || error.error_description || error.details) || String(error || "操作失敗");
    var lower = message.toLowerCase();
    if (lower.indexOf("teacher role required") !== -1 || lower.indexOf("class teacher required") !== -1) return "此帳號尚未取得教師權限。";
    if (lower.indexOf("class code not found") !== -1) return "找不到這個班級代碼，請向老師確認。";
    if (lower.indexOf("already owns") !== -1) return "這是你建立的班級，不需要加入。";
    if (lower.indexOf("network") !== -1 || lower.indexOf("fetch") !== -1) return "目前無法連線，請稍後再試。";
    return message;
  }
  function mockDefault() {
    return { version: 2, sequence: 1, profiles: {}, classes: [], members: [], assignments: [], submissions: [], learningEvents: [] };
  }
  function mockRead() {
    var data = readJson(MOCK_KEY, null);
    if (!record(data)) data = mockDefault();
    if (!record(data.profiles)) data.profiles = {};
    ["classes", "members", "assignments", "submissions", "learningEvents"].forEach(function (key) { if (!Array.isArray(data[key])) data[key] = []; });
    data.sequence = Math.max(1, data.sequence | 0);
    return data;
  }
  function mockWrite(data) { writeJson(MOCK_KEY, data); }
  function qaId(data, prefix) { var id = prefix + "-" + String(data.sequence++).padStart(4, "0"); return id; }
  function currentUser() { return global.CloudSync && global.CloudSync.user; }
  function assignmentMetric(assignment) {
    var target = record(assignment && assignment.target) ? assignment.target : {};
    var summary = global.Storage && global.Storage.getQuestionSummary ? global.Storage.getQuestionSummary() : {};
    var progress = 0, goal = 1, label = "";
    if (assignment.kind === "stage") {
      progress = global.Storage && global.Storage.isStageCleared && global.Storage.isStageCleared(target.stageId) ? 1 : 0;
      goal = 1;
      var stage = global.GameData && global.GameData.getStage ? global.GameData.getStage(target.stageId) : null;
      label = "完成「" + (stage ? stage.name : target.stageId || "指定關卡") + "」";
    } else if (assignment.kind === "correction_count") {
      progress = Math.max(0, summary.corrected | 0);
      goal = Math.max(1, target.count | 0);
      label = "完成 " + goal + " 題錯題訂正";
    } else {
      progress = Math.max(0, summary.attempts | 0);
      goal = Math.max(1, target.count | 0);
      label = "累積回答 " + goal + " 題";
    }
    return { progress: progress, goal: goal, met: progress >= goal, label: label };
  }
  function evidence(metric) {
    var summary = global.Storage && global.Storage.getQuestionSummary ? global.Storage.getQuestionSummary() : {};
    return {
      localRevision: Number(global.Storage && global.Storage.data && global.Storage.data.saveMeta && global.Storage.data.saveMeta.revision) || 0,
      progress: metric.progress,
      goal: metric.goal,
      clearedStages: (global.Storage && global.Storage.data && global.Storage.data.clearedStages || []).slice(0, 20),
      quizAttempts: summary.attempts | 0,
      corrected: summary.corrected | 0,
      reportedAt: nowIso()
    };
  }
  function eventMetric(assignment, events, studentId) {
    var target = record(assignment && assignment.target) ? assignment.target : {};
    var own = (events || []).filter(function (event) { return !studentId || event.student_id === studentId; });
    var progress = 0;
    if (assignment.kind === "stage") {
      progress = own.some(function (event) { return event.kind === "stage_clear" && event.subjectId === target.stageId; }) ? 1 : 0;
    } else if (assignment.kind === "correction_count") {
      progress = own.filter(function (event) { return event.kind === "correction"; }).reduce(function (sum, event) { return sum + Math.max(1, event.amount | 0); }, 0);
    } else {
      progress = own.filter(function (event) { return event.kind === "quiz_answer"; }).reduce(function (sum, event) { return sum + Math.max(1, event.amount | 0); }, 0);
    }
    return { progress: progress, goal: assignment.kind === "stage" ? 1 : Math.max(1, target.count | 0) };
  }

  var Education = {
    app: null,
    loading: false,
    error: null,
    message: "登入後即可加入班級或開啟教師後台。",
    profile: null,
    classes: [],
    members: [],
    profiles: [],
    assignments: [],
    submissions: [],
    selectedClassId: null,
    _userId: null,
    _reportTimer: 0,
    _refreshing: null,

    init: function (app) {
      this.app = app;
      var self = this;
      global.addEventListener("cloud-state-changed", function (event) { self.onCloudState(event && event.detail); });
      global.addEventListener("game-save-changed", function () {
        if (!self.profile || self.profile.role !== "student") return;
        if (self._reportTimer) global.clearTimeout(self._reportTimer);
        self._reportTimer = global.setTimeout(function () { self._reportTimer = 0; self.syncProgress(); }, REPORT_DELAY);
      });
      this.onCloudState(global.CloudSync && global.CloudSync.getState ? global.CloudSync.getState() : null);
    },

    onCloudState: function (state) {
      state = state || {};
      if (!state.signedIn || !state.user) {
        this._userId = null;
        this.profile = null;
        this.classes = []; this.members = []; this.profiles = []; this.assignments = []; this.submissions = [];
        this.selectedClassId = null;
        this.message = state.configured === false ? "尚未設定雲端服務，班級功能目前不可用。" : "請先登入守護者帳號。";
        this.emit();
        return;
      }
      if (this._userId !== state.user.id) {
        this._userId = state.user.id;
        this.refresh();
      }
    },

    emit: function () {
      var state = this.getState();
      try { global.dispatchEvent(new CustomEvent("education-state-changed", { detail: state })); } catch (error) {}
      if (global.UI && global.UI.updateEducationBadge) global.UI.updateEducationBadge(state);
      if (global.UI && global.UI.renderEducation && this.app && this.app.state === "EDUCATION") global.UI.renderEducation(state);
    },

    getState: function () {
      var classes = clone(this.classes) || [];
      var assignments = clone(this.assignments) || [];
      var submissions = clone(this.submissions) || [];
      if (this.profile && this.profile.role === "student") {
        assignments.forEach(function (assignment) { assignment.metric = assignmentMetric(assignment); });
      }
      return {
        configured: !!(global.CloudSync && global.CloudSync.configured),
        signedIn: !!(global.CloudSync && global.CloudSync.user),
        qa: !!(global.CloudSync && global.CloudSync.qa),
        loading: this.loading,
        error: this.error,
        message: this.message,
        profile: clone(this.profile),
        role: this.profile && this.profile.role || null,
        classes: classes,
        members: clone(this.members) || [],
        profiles: clone(this.profiles) || [],
        assignments: assignments,
        submissions: submissions,
        selectedClassId: this.selectedClassId
      };
    },

    refresh: function (options) {
      options = options || {};
      if (this._refreshing) return this._refreshing;
      if (!global.CloudSync || !global.CloudSync.user) { this.onCloudState(global.CloudSync && global.CloudSync.getState()); return Promise.resolve(null); }
      var self = this;
      this.loading = true; this.error = null; this.message = "正在更新班級資料…"; this.emit();
      this._refreshing = (async function () {
        try {
          if (global.CloudSync.qa) await self.loadMock(); else await self.loadRemote();
          self.chooseClass();
          self.message = self.profile && self.profile.role === "teacher" ? "教師後台資料已更新。" : "班級與作業資料已更新。";
          if (!options.skipReport && self.profile && self.profile.role === "student") await self.syncProgress(true);
          return self.getState();
        } catch (error) {
          self.error = educationError(error);
          self.message = self.error;
          return null;
        } finally {
          self.loading = false;
          self._refreshing = null;
          self.emit();
        }
      })();
      return this._refreshing;
    },

    chooseClass: function () {
      var exists = this.classes.some(function (item) { return item.id === Education.selectedClassId; });
      if (!exists) this.selectedClassId = this.classes.length ? this.classes[0].id : null;
    },

    selectClass: function (id) {
      if (this.classes.some(function (item) { return item.id === id; })) this.selectedClassId = id;
      this.emit();
    },

    rpc: function (name, body) {
      return global.CloudSync.rest("rpc/" + name, { method: "POST", body: body || {} });
    },

    loadRemote: async function () {
      var user = currentUser();
      this.profile = await this.rpc("ensure_game_profile", {});
      var base = await Promise.all([
        global.CloudSync.rest("game_classes?select=id,teacher_id,name,code,active,created_at&active=eq.true&order=created_at.desc"),
        global.CloudSync.rest("game_class_members?select=class_id,student_id,status,joined_at&status=eq.active")
      ]);
      var classes = Array.isArray(base[0]) ? base[0] : [];
      var members = Array.isArray(base[1]) ? base[1] : [];
      if (this.profile.role === "teacher") classes = classes.filter(function (item) { return item.teacher_id === user.id; });
      else {
        var joined = members.filter(function (item) { return item.student_id === user.id; }).map(function (item) { return item.class_id; });
        classes = classes.filter(function (item) { return joined.indexOf(item.id) !== -1; });
      }
      var classIds = classes.map(function (item) { return item.id; });
      this.classes = classes;
      this.members = members.filter(function (item) { return classIds.indexOf(item.class_id) !== -1; });
      if (!classIds.length) { this.assignments = []; this.submissions = []; this.profiles = []; return; }
      var assignments = await global.CloudSync.rest("game_assignments?select=id,class_id,title,description,kind,target,due_at,published_at,active&active=eq.true&class_id=in.(" + classIds.join(",") + ")&order=published_at.desc");
      this.assignments = Array.isArray(assignments) ? assignments : [];
      var assignmentIds = this.assignments.map(function (item) { return item.id; });
      var submissions = assignmentIds.length ? await global.CloudSync.rest("game_assignment_submissions?select=assignment_id,student_id,status,progress,evidence,completed_at,reviewed_at,feedback,updated_at&assignment_id=in.(" + assignmentIds.join(",") + ")") : [];
      this.submissions = Array.isArray(submissions) ? submissions : [];
      if (this.profile.role === "student") this.submissions = this.submissions.filter(function (item) { return item.student_id === user.id; });
      var profileIds = this.profile.role === "teacher" ? this.members.map(function (item) { return item.student_id; }) : [];
      var profiles = profileIds.length ? await global.CloudSync.rest("game_profiles?select=user_id,display_name,role&user_id=in.(" + profileIds.join(",") + ")") : [];
      this.profiles = Array.isArray(profiles) ? profiles : [];
    },

    ensureMockProfile: function (data) {
      var user = currentUser();
      if (!user) return null;
      if (!record(data.profiles[user.id])) {
        data.profiles[user.id] = { user_id: user.id, display_name: clean((user.email || "守護者").split("@")[0], 60) || "守護者", role: "student" };
        mockWrite(data);
      }
      var params = new URLSearchParams(global.location.search);
      if (global.TestMode && global.TestMode.enabled && global.CloudSync && global.CloudSync.qa && params.get("qaTeacher") === "1" && data.profiles[user.id].role !== "teacher") {
        data.profiles[user.id].role = "teacher";
        mockWrite(data);
      }
      return data.profiles[user.id];
    },

    loadMock: async function () {
      var data = mockRead(), user = currentUser();
      this.profile = clone(this.ensureMockProfile(data));
      if (this.profile.role === "teacher") {
        this.classes = data.classes.filter(function (item) { return item.teacher_id === user.id && item.active; });
      } else {
        var joined = data.members.filter(function (item) { return item.student_id === user.id && item.status === "active"; }).map(function (item) { return item.class_id; });
        this.classes = data.classes.filter(function (item) { return joined.indexOf(item.id) !== -1 && item.active; });
      }
      var classIds = this.classes.map(function (item) { return item.id; });
      this.members = data.members.filter(function (item) { return classIds.indexOf(item.class_id) !== -1 && item.status === "active"; });
      this.assignments = data.assignments.filter(function (item) { return classIds.indexOf(item.class_id) !== -1 && item.active; });
      var assignmentIds = this.assignments.map(function (item) { return item.id; });
      this.submissions = data.submissions.filter(function (item) { return assignmentIds.indexOf(item.assignment_id) !== -1 && (this.profile.role === "teacher" || item.student_id === user.id); }, this);
      this.profiles = this.profile.role === "teacher" ? this.members.map(function (member) { return clone(data.profiles[member.student_id]); }).filter(Boolean) : [];
    },

    createClass: async function (name) {
      name = clean(name, 60);
      if (name.length < 2) return this.fail("班級名稱至少需要 2 個字元。");
      try {
        if (global.CloudSync.qa) {
          var data = mockRead(), profile = this.ensureMockProfile(data);
          if (!profile || profile.role !== "teacher") throw { message: "teacher role required" };
          var code = ("CL" + String(data.sequence).padStart(4, "0")).slice(-6).toUpperCase();
          data.classes.push({ id: qaId(data, "class"), teacher_id: profile.user_id, name: name, code: code, active: true, created_at: nowIso() });
          mockWrite(data);
        } else await this.rpc("create_game_class", { p_name: name });
        this.message = "班級已建立，現在可以分享班級代碼。";
        await this.refresh({ skipReport: true });
        if (global.UI) global.UI.showToast("班級建立完成", "把六位代碼提供給學生即可加入。");
        return true;
      } catch (error) { return this.fail(educationError(error)); }
    },

    joinClass: async function (code) {
      code = clean(code, 12).replace(/[^a-z0-9]/gi, "").toUpperCase();
      if (code.length !== 6) return this.fail("請輸入 6 位班級代碼。");
      try {
        if (global.CloudSync.qa) {
          var data = mockRead(), user = currentUser(); this.ensureMockProfile(data);
          var found = data.classes.find(function (item) { return item.code === code && item.active; });
          if (!found) throw { message: "class code not found" };
          var member = data.members.find(function (item) { return item.class_id === found.id && item.student_id === user.id; });
          if (member) { member.status = "active"; member.joined_at = nowIso(); }
          else data.members.push({ class_id: found.id, student_id: user.id, status: "active", joined_at: nowIso() });
          mockWrite(data);
        } else await this.rpc("join_game_class", { p_code: code });
        this.message = "已加入班級。";
        await this.refresh();
        if (global.UI) global.UI.showToast("加入班級成功", "老師派發的作業會出現在班級中心。");
        return true;
      } catch (error) { return this.fail(educationError(error)); }
    },

    createAssignment: async function (draft) {
      draft = draft || {};
      var classId = this.selectedClassId;
      var title = clean(draft.title, 80), description = clean(draft.description, 300);
      var kind = ["stage", "quiz_count", "correction_count"].indexOf(draft.kind) !== -1 ? draft.kind : "stage";
      if (!classId) return this.fail("請先建立並選擇班級。");
      if (title.length < 2) return this.fail("作業名稱至少需要 2 個字元。");
      var target = kind === "stage" ? { stageId: clean(draft.stageId, 40) || "tidal_flat" } : { count: Math.max(1, Math.min(100, draft.count | 0 || 1)) };
      var dueAt = draft.dueAt ? new Date(draft.dueAt).toISOString() : null;
      try {
        if (global.CloudSync.qa) {
          var data = mockRead(), user = currentUser();
          var owns = data.classes.some(function (item) { return item.id === classId && item.teacher_id === user.id; });
          if (!owns) throw { message: "class teacher required" };
          data.assignments.push({ id: qaId(data, "assignment"), class_id: classId, title: title, description: description, kind: kind, target: target, due_at: dueAt, published_at: nowIso(), active: true });
          mockWrite(data);
        } else await this.rpc("create_game_assignment", { p_class_id: classId, p_title: title, p_description: description, p_kind: kind, p_target: target, p_due_at: dueAt });
        this.message = "作業已派發。";
        await this.refresh({ skipReport: true });
        if (global.UI) global.UI.showToast("作業已派發", "學生達成條件後會自動送交驗收。");
        return true;
      } catch (error) { return this.fail(educationError(error)); }
    },

    reportOne: async function (assignment, metric) {
      var user = currentUser(), proof = evidence(metric);
      if (global.CloudSync.qa) {
        var data = mockRead();
        var verified = eventMetric(assignment, data.learningEvents, user.id);
        metric = Object.assign({}, metric, verified);
        proof.source = "server_event_log_qa";
        proof.eventCount = data.learningEvents.filter(function (event) { return event.student_id === user.id; }).length;
        proof.progress = verified.progress;
        proof.goal = verified.goal;
        var row = data.submissions.find(function (item) { return item.assignment_id === assignment.id && item.student_id === user.id; });
        var goalMet = metric.progress >= metric.goal;
        if (!row) {
          row = { assignment_id: assignment.id, student_id: user.id, status: goalMet ? "pending_review" : "in_progress", progress: metric.progress, evidence: proof, completed_at: goalMet ? nowIso() : null, reviewed_at: null, feedback: "", updated_at: nowIso() };
          data.submissions.push(row);
        } else if (row.status !== "accepted") {
          row.progress = Math.max(row.progress | 0, metric.progress);
          row.evidence = proof;
          if (goalMet) { row.status = "pending_review"; if (!row.completed_at) row.completed_at = nowIso(); row.reviewed_at = null; row.feedback = ""; }
          row.updated_at = nowIso();
        }
        mockWrite(data); return row;
      }
      return await this.rpc("refresh_game_assignment_progress", { p_assignment_id: assignment.id, p_evidence: proof });
    },

    flushLearningEvents: async function () {
      var events = global.Storage && global.Storage.getPendingLearningEvents ? global.Storage.getPendingLearningEvents() : [];
      if (!events.length || !currentUser()) return 0;
      if (global.CloudSync.qa) {
        var data = mockRead(), user = currentUser(), existing = {};
        data.learningEvents.forEach(function (event) { existing[event.student_id + ":" + event.id] = true; });
        events.forEach(function (event) {
          var key = user.id + ":" + event.id;
          if (!existing[key]) data.learningEvents.push(Object.assign({ student_id: user.id, receivedAt: nowIso() }, event));
        });
        mockWrite(data);
      } else {
        await this.rpc("record_game_learning_events", { p_events: events });
      }
      global.Storage.acknowledgeLearningEvents(events.map(function (event) { return event.id; }));
      return events.length;
    },

    syncProgress: async function (fromRefresh) {
      if (!this.profile || this.profile.role !== "student" || !currentUser()) return false;
      var user = currentUser(), submissions = this.submissions, changed = false;
      try {
        var flushed = await this.flushLearningEvents();
        if (flushed) changed = true;
        for (var i = 0; i < this.assignments.length; i++) {
          var assignment = this.assignments[i], metric = assignmentMetric(assignment);
          var row = submissions.find(function (item) { return item.assignment_id === assignment.id && item.student_id === user.id; });
          var priorRevision = Number(row && row.evidence && row.evidence.localRevision) || 0;
          var localRevision = Number(global.Storage && global.Storage.data && global.Storage.data.saveMeta && global.Storage.data.saveMeta.revision) || 0;
          var shouldReport = !!flushed || !row || metric.progress > (row.progress | 0) || (row.status === "needs_revision" && localRevision > priorRevision);
          if (row && row.status === "accepted") shouldReport = false;
          if (shouldReport) { await this.reportOne(assignment, metric); changed = true; }
        }
        if (changed) {
          if (global.CloudSync.qa) await this.loadMock(); else await this.loadRemote();
          this.chooseClass();
          if (!fromRefresh) { this.message = "作業進度已更新。"; this.emit(); }
        }
        return changed;
      } catch (error) {
        this.error = educationError(error); this.message = this.error; this.emit(); return false;
      }
    },

    review: async function (assignmentId, studentId, decision, feedback) {
      if (["accepted", "needs_revision"].indexOf(decision) === -1) return false;
      feedback = clean(feedback, 300);
      if (decision === "needs_revision" && !feedback) feedback = "請依作業條件再練習後重新送出。";
      try {
        if (global.CloudSync.qa) {
          var data = mockRead(), user = currentUser();
          var assignment = data.assignments.find(function (item) { return item.id === assignmentId; });
          var owns = assignment && data.classes.some(function (item) { return item.id === assignment.class_id && item.teacher_id === user.id; });
          if (!owns) throw { message: "class teacher required" };
          var row = data.submissions.find(function (item) { return item.assignment_id === assignmentId && item.student_id === studentId; });
          if (!row || ["pending_review", "accepted", "needs_revision"].indexOf(row.status) === -1) throw { message: "submission not ready" };
          row.status = decision; row.reviewed_at = nowIso(); row.reviewed_by = user.id; row.feedback = feedback; row.updated_at = nowIso();
          mockWrite(data);
        } else await this.rpc("review_game_assignment", { p_assignment_id: assignmentId, p_student_id: studentId, p_decision: decision, p_feedback: feedback });
        this.message = decision === "accepted" ? "已驗收學生作業。" : "已退回學生作業。";
        await this.refresh({ skipReport: true });
        return true;
      } catch (error) { return this.fail(educationError(error)); }
    },

    fail: function (message) {
      this.error = clean(message, 300) || "操作失敗，請稍後再試。";
      this.message = this.error; this.loading = false; this.emit();
      if (global.UI) global.UI.showToast("班級操作未完成", this.error);
      return false;
    },

    __qaReset: function () { try { global.localStorage.removeItem(MOCK_KEY); } catch (error) {} this.profile = null; this.classes = []; this.members = []; this.profiles = []; this.assignments = []; this.submissions = []; this.selectedClassId = null; this.emit(); },
    __qaSetRole: async function (role) {
      if (!global.CloudSync || !global.CloudSync.qa || !currentUser()) return false;
      var data = mockRead(), profile = this.ensureMockProfile(data);
      profile.role = role === "teacher" ? "teacher" : "student";
      mockWrite(data); await this.refresh({ skipReport: true }); return true;
    },
    __qaData: function () { return clone(mockRead()); }
  };

  global.Education = Education;
})(window);
