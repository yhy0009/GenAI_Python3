(() => {
  "use strict";

  const LIMITS = {
    service_name: 100,
    symptom: 2000,
    logs: 4000,
    recent_changes: 1000,
    total: 4000,
  };
  const THEME_STORAGE_KEY = "opstriage-theme";
  const themePreference = window.matchMedia("(prefers-color-scheme: dark)");

  const SAMPLE_INCIDENT = {
    service_name: "Payment API",
    environment: "Production",
    symptom: "배포 직후 결제 요청에서 502 오류가 증가했습니다.",
    logs: "upstream timed out while reading response header from upstream",
    recent_changes: "30분 전에 애플리케이션 새 버전을 배포했습니다.",
  };

  const form = document.querySelector("#incident-form");
  if (!form) return;

  const fields = {
    service_name: form.elements.service_name,
    environment: form.elements.environment,
    symptom: form.elements.symptom,
    logs: form.elements.logs,
    recent_changes: form.elements.recent_changes,
  };

  const ui = {
    header: document.querySelector("[data-header]"),
    navigation: document.querySelector("[data-navigation]"),
    menuToggle: document.querySelector("[data-menu-toggle]"),
    themeToggle: document.querySelector("[data-theme-toggle]"),
    themeLabel: document.querySelector("[data-theme-label]"),
    submit: document.querySelector("[data-submit]"),
    submitLabel: document.querySelector("[data-submit-label]"),
    sample: document.querySelector("[data-sample]"),
    formError: document.querySelector("[data-form-error]"),
    totalCount: document.querySelector("[data-total-count]"),
    totalBar: document.querySelector("[data-total-bar]"),
    totalWrap: document.querySelector("[data-total-wrap]"),
    resultTitle: document.querySelector("#result-title"),
    resultEmpty: document.querySelector("[data-result-empty]"),
    resultLoading: document.querySelector("[data-result-loading]"),
    resultContent: document.querySelector("[data-result-content]"),
    loadingMessage: document.querySelector("[data-loading-message]"),
    copy: document.querySelector("[data-copy]"),
    toast: document.querySelector("[data-toast]"),
    summary: document.querySelector("[data-result-summary]"),
    severity: document.querySelector("[data-result-severity]"),
    causes: document.querySelector("[data-result-causes]"),
    checks: document.querySelector("[data-result-checks]"),
    mitigations: document.querySelector("[data-result-mitigations]"),
    communication: document.querySelector("[data-result-communication]"),
    additional: document.querySelector("[data-result-additional]"),
  };

  let isAnalyzing = false;
  let currentAnalysis = null;
  let loadingTimer = null;
  let toastTimer = null;

  class AppError extends Error {}

  function readStoredTheme() {
    try {
      const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
      return theme === "dark" || theme === "light" ? theme : null;
    } catch {
      return null;
    }
  }

  function applyTheme(theme, source = "system") {
    const isDark = theme === "dark";
    const actionLabel = isDark ? "라이트 모드로 전환" : "다크 모드로 전환";

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    ui.themeToggle?.setAttribute("aria-pressed", String(isDark));
    ui.themeToggle?.setAttribute("aria-label", actionLabel);
    ui.themeToggle?.setAttribute("title", actionLabel);
    if (ui.themeLabel) ui.themeLabel.textContent = actionLabel;

    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute("content", isDark ? "#07101c" : "#f5f7f8");

    document.dispatchEvent(
      new CustomEvent("opstriage:theme-change", {
        detail: { theme, source },
      }),
    );
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The visible theme still changes even when storage is unavailable.
    }
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    saveTheme(nextTheme);
    applyTheme(nextTheme, "user");
    showToast(nextTheme === "dark" ? "다크 모드를 적용했습니다." : "라이트 모드를 적용했습니다.");
  }

  function getPayload() {
    return Object.fromEntries(
      Object.entries(fields).map(([name, field]) => [name, field.value.trim()]),
    );
  }

  function getAnalysisLength(payload = getPayload()) {
    return payload.symptom.length + payload.logs.length + payload.recent_changes.length;
  }

  function updateCounters() {
    Object.entries(fields).forEach(([name, field]) => {
      const target = document.querySelector(`[data-count="${name}"]`);
      if (target) target.textContent = field.value.length.toLocaleString("ko-KR");
    });

    const total = getAnalysisLength();
    const ratio = Math.min((total / LIMITS.total) * 100, 100);
    ui.totalCount.textContent = total.toLocaleString("ko-KR");
    ui.totalBar.style.width = `${ratio}%`;
    ui.totalWrap.classList.toggle("is-warning", ratio >= 80 && total <= LIMITS.total);
    ui.totalWrap.classList.toggle("is-error", total > LIMITS.total);
  }

  function clearFieldError(name) {
    const field = fields[name];
    const error = document.querySelector(`#${field.id}-error`);
    field.removeAttribute("aria-invalid");
    field.closest(".field-group")?.classList.remove("has-error");
    if (error) error.textContent = "";
  }

  function setFieldError(name, message) {
    const field = fields[name];
    const error = document.querySelector(`#${field.id}-error`);
    field.setAttribute("aria-invalid", "true");
    field.closest(".field-group")?.classList.add("has-error");
    if (error) error.textContent = message;
  }

  function clearErrors() {
    Object.keys(fields).forEach(clearFieldError);
    setFormError("");
  }

  function setFormError(message) {
    ui.formError.textContent = message;
    ui.formError.hidden = !message;
  }

  function validateForm() {
    clearErrors();
    const payload = getPayload();
    let firstInvalid = null;

    const flag = (name, message) => {
      setFieldError(name, message);
      if (!firstInvalid) firstInvalid = fields[name];
    };

    if (!payload.environment) {
      flag("environment", "운영 환경을 선택해주세요.");
    }
    if (!payload.symptom) {
      flag("symptom", "장애 증상을 입력해주세요.");
    }

    Object.entries(LIMITS).forEach(([name, limit]) => {
      if (name !== "total" && payload[name]?.length > limit) {
        flag(name, `최대 ${limit.toLocaleString("ko-KR")}자까지 입력할 수 있습니다.`);
      }
    });

    if (getAnalysisLength(payload) > LIMITS.total) {
      setFormError("장애 증상, 로그와 최근 변경 사항은 합계 4,000자 이하로 작성해주세요.");
      if (!firstInvalid) firstInvalid = fields.logs;
    }

    if (firstInvalid) {
      firstInvalid.focus();
      return null;
    }
    return payload;
  }

  function setResultState(state) {
    ui.resultEmpty.hidden = state !== "empty";
    ui.resultLoading.hidden = state !== "loading";
    ui.resultContent.hidden = state !== "content";
    ui.copy.hidden = state !== "content";
  }

  function setLoading(active) {
    isAnalyzing = active;
    ui.submit.disabled = active;
    ui.submit.classList.toggle("is-loading", active);
    ui.submitLabel.textContent = active ? "분석 중" : "AI로 분석하기";

    if (active) {
      setResultState("loading");
      const messages = [
        "로그와 최근 변경 사항의 연관성을 확인하는 중입니다.",
        "가능한 원인과 판단 근거를 정리하는 중입니다.",
        "안전한 초동 대응 순서를 구성하는 중입니다.",
      ];
      let index = 0;
      ui.loadingMessage.textContent = messages[index];
      loadingTimer = window.setInterval(() => {
        index = (index + 1) % messages.length;
        ui.loadingMessage.textContent = messages[index];
      }, 3500);
    } else if (loadingTimer) {
      window.clearInterval(loadingTimer);
      loadingTimer = null;
    }
  }

  function isValidAnalysis(data) {
    const validString = (value) => typeof value === "string" && value.trim().length > 0;
    const validStringList = (value) => Array.isArray(value) && value.length > 0 && value.every(validString);
    return (
      data &&
      typeof data === "object" &&
      validString(data.summary) &&
      ["SEV-1", "SEV-2", "SEV-3", "SEV-4"].includes(data.severity) &&
      Array.isArray(data.possible_causes) &&
      data.possible_causes.length > 0 &&
      data.possible_causes.every(
        (item) => item && validString(item.cause) && validString(item.reason),
      ) &&
      validStringList(data.first_checks) &&
      validStringList(data.mitigations) &&
      validString(data.communication) &&
      validStringList(data.additional_information)
    );
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderCauses(causes) {
    const fragment = document.createDocumentFragment();
    causes.forEach((item, index) => {
      const article = createElement("article", "cause-item");
      const number = createElement("span", "", String(index + 1).padStart(2, "0"));
      const content = createElement("div");
      content.append(
        createElement("strong", "", item.cause),
        createElement("p", "", item.reason),
      );
      article.append(number, content);
      fragment.append(article);
    });
    ui.causes.replaceChildren(fragment);
  }

  function renderList(container, items) {
    const fragment = document.createDocumentFragment();
    items.forEach((item) => fragment.append(createElement("li", "", item)));
    container.replaceChildren(fragment);
  }

  function renderAnalysis(data) {
    currentAnalysis = data;
    ui.summary.textContent = data.summary;
    ui.severity.textContent = data.severity;
    ui.severity.dataset.level = data.severity;
    ui.communication.textContent = data.communication;
    renderCauses(data.possible_causes);
    renderList(ui.checks, data.first_checks);
    renderList(ui.mitigations, data.mitigations);
    renderList(ui.additional, data.additional_information);
    setResultState("content");

    if (window.matchMedia("(max-width: 1050px)").matches) {
      ui.resultTitle.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.setTimeout(() => ui.resultTitle.focus({ preventScroll: true }), 450);
  }

  async function analyzeIncident(payload) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      let body;
      try {
        body = await response.json();
      } catch {
        throw new AppError("분석 결과를 처리하지 못했습니다.");
      }

      if (!response.ok || !body?.success) {
        throw new AppError(
          body?.error?.message || "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        );
      }
      if (!isValidAnalysis(body.data)) {
        throw new AppError("분석 결과를 처리하지 못했습니다.");
      }
      return body.data;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new AppError("응답이 지연되고 있습니다. 다시 시도해주세요.");
      }
      if (error instanceof AppError) throw error;
      throw new AppError("서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function formatAnalysis(data) {
    const numbered = (items) => items.map((item, index) => `${index + 1}. ${item}`).join("\n");
    return [
      "# OpsTriage 장애 분석 결과",
      "",
      `## 장애 요약\n${data.summary}`,
      "",
      `## 예상 심각도\n${data.severity}`,
      "",
      "## 가능한 원인과 판단 근거",
      data.possible_causes
        .map((item, index) => `${index + 1}. **${item.cause}**\n   - ${item.reason}`)
        .join("\n"),
      "",
      `## 우선 확인 항목\n${numbered(data.first_checks)}`,
      "",
      `## 완화 및 롤백 방안\n${numbered(data.mitigations)}`,
      "",
      `## 팀 공유용 공지 초안\n${data.communication}`,
      "",
      `## 추가로 필요한 정보\n${numbered(data.additional_information)}`,
      "",
      "> AI가 제안한 참고 정보입니다. 실제 변경 전 시스템 상태와 담당자 승인을 확인하세요.",
    ].join("\n");
  }

  async function copyResult() {
    if (!currentAnalysis) return;
    const content = formatAnalysis(currentAnalysis);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      showToast("분석 결과를 Markdown 형식으로 복사했습니다.");
    } catch {
      showToast("복사하지 못했습니다. 브라우저 권한을 확인해주세요.");
    }
  }

  function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => ui.toast.classList.remove("is-visible"), 2600);
  }

  function resetInterface() {
    currentAnalysis = null;
    clearErrors();
    updateCounters();
    setResultState("empty");
  }

  form.addEventListener("input", (event) => {
    const name = event.target.name;
    if (name && fields[name]) clearFieldError(name);
    setFormError("");
    updateCounters();
  });

  form.addEventListener("change", (event) => {
    const name = event.target.name;
    if (name && fields[name]) clearFieldError(name);
  });

  form.addEventListener("reset", (event) => {
    if (isAnalyzing) {
      event.preventDefault();
      return;
    }
    window.setTimeout(resetInterface, 0);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isAnalyzing) return;

    const payload = validateForm();
    if (!payload) return;

    setLoading(true);
    setFormError("");
    currentAnalysis = null;

    try {
      const analysis = await analyzeIncident(payload);
      renderAnalysis(analysis);
    } catch (error) {
      setResultState("empty");
      setFormError(error.message);
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    } finally {
      setLoading(false);
    }
  });

  ui.sample.addEventListener("click", () => {
    if (isAnalyzing) return;
    Object.entries(SAMPLE_INCIDENT).forEach(([name, value]) => {
      fields[name].value = value;
    });
    clearErrors();
    updateCounters();
    fields.symptom.focus();
    showToast("대표 장애 시나리오를 불러왔습니다.");
  });

  ui.copy.addEventListener("click", copyResult);
  ui.themeToggle?.addEventListener("click", toggleTheme);

  themePreference.addEventListener?.("change", (event) => {
    if (!readStoredTheme()) applyTheme(event.matches ? "dark" : "light", "system");
  });

  ui.menuToggle?.addEventListener("click", () => {
    const expanded = ui.menuToggle.getAttribute("aria-expanded") === "true";
    ui.menuToggle.setAttribute("aria-expanded", String(!expanded));
    ui.menuToggle.querySelector(".sr-only").textContent = expanded ? "메뉴 열기" : "메뉴 닫기";
    ui.navigation.classList.toggle("is-open", !expanded);
  });

  ui.navigation?.addEventListener("click", (event) => {
    if (event.target.matches("a")) {
      ui.navigation.classList.remove("is-open");
      ui.menuToggle?.setAttribute("aria-expanded", "false");
      const label = ui.menuToggle?.querySelector(".sr-only");
      if (label) label.textContent = "메뉴 열기";
    }
  });

  const navLinks = [...document.querySelectorAll("[data-navigation] a")];
  const sections = [...document.querySelectorAll("[data-section]")];
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        navLinks.forEach((link) => {
          link.classList.toggle("is-active", link.hash === `#${visible.target.id}`);
        });
      },
      { rootMargin: "-25% 0px -60%", threshold: [0.05, 0.25, 0.5] },
    );
    sections.forEach((section) => observer.observe(section));
  }

  const updateHeader = () => ui.header?.classList.toggle("is-scrolled", window.scrollY > 24);
  window.addEventListener("scroll", updateHeader, { passive: true });
  applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light", readStoredTheme() ? "stored" : "system");
  updateHeader();
  updateCounters();
})();
