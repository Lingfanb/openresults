(function () {
  "use strict";

  const root = document.getElementById("resultGroups");
  if (!root) return;

  const scriptUrl = document.currentScript ? new URL(document.currentScript.src) : null;
  const assetVersion = scriptUrl ? scriptUrl.searchParams.get("v") : "";

  const search = document.getElementById("resultSearch");
  const projectFilter = document.getElementById("projectFilter");
  const statusFilter = document.getElementById("statusFilter");
  const projectField = document.getElementById("projectField");
  const statusField = document.getElementById("statusField");
  const clearButton = document.getElementById("clearFilters");
  const emptyState = document.getElementById("emptyState");
  const catalogStatus = document.getElementById("catalogStatus");
  const catalogTools = document.querySelector(".catalog-tools");
  const state = { query: "", project: "all", status: "all" };
  let catalog = [];

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const setLink = (link, href) => {
    link.href = new URL(href, document.baseURI).href;
    return link;
  };

  const formatDate = (value) => new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));

  function addOptions(select, values) {
    values.sort((a, b) => a.localeCompare(b)).forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    });
  }

  function renderCard(result) {
    const card = make("article", "result-card");

    const visualLink = setLink(make("a", "result-visual"), result.path);
    visualLink.setAttribute("aria-label", `Open ${result.title}`);
    const image = make("img");
    image.src = new URL(result.thumbnail, document.baseURI).href;
    image.alt = result.thumbnailAlt;
    image.loading = "lazy";
    visualLink.append(image);

    const body = make("div", "result-card-body");
    const meta = make("div", "result-meta");
    meta.append(make("span", "result-category", result.category));
    const date = make("time", "", formatDate(result.date));
    date.dateTime = result.date;
    meta.append(date);

    const heading = make("h3");
    const titleLink = setLink(make("a", "", result.title), result.path);
    heading.append(titleLink);

    const status = make("span", `result-status ${result.status.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, result.status);
    const summary = make("p", "result-summary", result.summary);

    const metrics = make("dl", "result-metrics");
    result.metrics.forEach((metric) => {
      const item = make("div");
      item.append(make("dt", "", metric.value));
      item.append(make("dd", "", metric.label));
      metrics.append(item);
    });

    const tags = make("ul", "result-tags");
    tags.setAttribute("aria-label", "Topics");
    result.tags.forEach((tag) => tags.append(make("li", "", tag)));

    const actions = make("div", "result-actions");
    const openLink = actions.appendChild(setLink(make("a", "primary-action", "Open result"), result.path));
    openLink.setAttribute("aria-label", `Open ${result.title}`);
    actions.appendChild(setLink(make("a", "secondary-action", "View evidence"), `${result.path}#results`));

    body.append(meta, heading, status, summary, metrics, tags, actions);
    card.append(visualLink, body);
    return card;
  }

  function render() {
    const query = state.query.trim().toLocaleLowerCase();
    const filtered = catalog.filter((result) => {
      const haystack = [result.title, result.summary, result.project, result.category, ...result.tags]
        .join(" ")
        .toLocaleLowerCase();
      return (!query || haystack.includes(query))
        && (state.project === "all" || result.project === state.project)
        && (state.status === "all" || result.status === state.status);
    });

    root.replaceChildren();
    const grouped = Map.groupBy
      ? Map.groupBy(filtered, (result) => result.project)
      : filtered.reduce((map, result) => map.set(result.project, [...(map.get(result.project) || []), result]), new Map());

    [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([project, results]) => {
      const group = make("details", "result-group");
      group.open = true;
      const groupHeader = make("summary");
      const label = make("span", "group-title", project);
      const count = make("span", "group-count", `${results.length} result${results.length === 1 ? "" : "s"}`);
      groupHeader.append(label, count);
      const grid = make("div", "result-grid");
      results
        .sort((a, b) => b.date.localeCompare(a.date))
        .forEach((result) => grid.append(renderCard(result)));
      group.append(groupHeader, grid);
      root.append(group);
    });

    const filtersActive = Boolean(query || state.project !== "all" || state.status !== "all");
    clearButton.hidden = !filtersActive;
    emptyState.hidden = filtered.length > 0;
    catalogStatus.textContent = filtersActive ? `${filtered.length} of ${catalog.length} results shown` : "";
    root.setAttribute("aria-busy", "false");
  }

  function syncUrl() {
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    if (state.project !== "all") params.set("project", state.project);
    if (state.status !== "all") params.set("status", state.status);
    const queryString = params.toString();
    history.replaceState(null, "", `${location.pathname}${queryString ? `?${queryString}` : ""}${location.hash}`);
  }

  function update() {
    syncUrl();
    render();
  }

  const catalogUrl = new URL("data/results.json", document.baseURI);
  if (assetVersion) catalogUrl.searchParams.set("v", assetVersion);

  fetch(catalogUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      catalog = data.results;
      const params = new URLSearchParams(location.search);
      const projects = [...new Set(catalog.map((item) => item.project))];
      const statuses = [...new Set(catalog.map((item) => item.status))];
      state.query = params.get("q") || "";
      state.project = projects.includes(params.get("project")) ? params.get("project") : "all";
      state.status = statuses.includes(params.get("status")) ? params.get("status") : "all";
      search.value = state.query;

      addOptions(projectFilter, projects);
      addOptions(statusFilter, statuses);
      projectFilter.value = state.project;
      statusFilter.value = state.status;
      projectField.hidden = projects.length < 2;
      statusField.hidden = statuses.length < 2;

      const latestDate = catalog.reduce((latest, item) => item.date > latest ? item.date : latest, "");
      document.getElementById("catalogUpdated").textContent = latestDate;
      document.getElementById("catalogUpdated").dateTime = latestDate;
      syncUrl();
      render();
    })
    .catch((error) => {
      root.setAttribute("aria-busy", "false");
      catalogTools.hidden = true;
      root.replaceChildren(make("p", "load-error", "The result catalog could not be loaded. Refresh the page to try again."));
      console.error(error);
    });

  search.addEventListener("input", () => { state.query = search.value; update(); });
  projectFilter.addEventListener("change", () => { state.project = projectFilter.value; update(); });
  statusFilter.addEventListener("change", () => { state.status = statusFilter.value; update(); });
  clearButton.addEventListener("click", () => {
    state.query = "";
    state.project = "all";
    state.status = "all";
    search.value = "";
    projectFilter.value = "all";
    statusFilter.value = "all";
    update();
    search.focus();
  });
}());
