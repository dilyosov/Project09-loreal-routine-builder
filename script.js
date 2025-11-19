/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateBtn = document.getElementById("generateRoutine");
const liveSearchCheckbox = document.getElementById("liveSearch");
const searchInput = document.getElementById("productSearch");

// cache all products so we can filter locally without re-fetching
let allProducts = [];

function debounce(fn, wait = 200) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function applyFilters() {
  const selectedCategory = categoryFilter ? categoryFilter.value : "";
  const term = searchInput ? searchInput.value.trim().toLowerCase() : "";

  // If no filters and no search term, show placeholder to encourage category selection
  if (!selectedCategory && !term) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        A routine as unique as you are
      </div>
    `;
    return;
  }

  let filtered = Array.isArray(allProducts) ? allProducts.slice() : [];
  if (selectedCategory) {
    filtered = filtered.filter((p) => p.category === selectedCategory);
  }
  if (term) {
    filtered = filtered.filter((p) => {
      const hay = `${p.name} ${p.brand} ${p.description} ${
        p.keywords || ""
      } `.toLowerCase();
      return hay.indexOf(term) !== -1;
    });
  }

  if (filtered.length === 0) {
    productsContainer.innerHTML = `<div class="placeholder-message">No products matched your search.</div>`;
  } else {
    displayProducts(filtered);
  }
}

// load products once at startup and apply filters
loadProducts().then((prods) => {
  allProducts = Array.isArray(prods) ? prods : [];
  applyFilters();
});

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Simple HTML-escaping to avoid injection when inserting user content */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Track selected products in a Map keyed by product id */
const selectedProducts = new Map();

const STORAGE_KEY = "loreal_selected_products_v1";

function saveSelectedProducts() {
  try {
    const arr = Array.from(selectedProducts.values());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch (e) {
    console.warn("Could not save selected products", e);
  }
}

function loadSavedSelectedProducts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    arr.forEach((p) => {
      // Ensure id is a number
      selectedProducts.set(Number(p.id), p);
    });
  } catch (e) {
    console.warn("Could not load saved selected products", e);
  }
}

// load saved selections on startup
loadSavedSelectedProducts();
// render saved selections immediately so user sees them before choosing a category
renderSelectedProducts();

/* Conversation history for the chatbox (system + user + assistant messages) */
const conversation = [
  {
    role: "system",
    content:
      "You are an expert beauty advisor. Answer only about the user's generated routine or related topics: skincare, haircare, makeup, fragrance, and grooming. If the user asks unrelated questions, reply briefly that you can only help with those topics. Be concise and give practical, safe advice (e.g., mention sunscreen for AM, retinol at night).",
  },
];

/* Render the conversation (excluding system messages) into the chat window */
function renderChat() {
  if (!chatWindow) return;
  const nodes = conversation
    .filter((m) => m.role !== "system" && !m.hidden)
    .map((m) => {
      const cls = m.role === "user" ? "chat-message user" : "chat-message bot";
      // preserve line breaks as <br>
      const content = escapeHtml(String(m.content)).replace(/\n/g, "<br>");
      return `<div class="${cls}"><div class="bubble">${content}</div></div>`;
    });

  chatWindow.innerHTML = nodes.join("\n");
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Create HTML for displaying product cards and attach handlers */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card" data-id="${
      product.id
    }" role="button" tabindex="0">
      <img src="${product.image}" alt="${escapeHtml(product.name)}">
      <div class="product-info">
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.brand)}</p>
        <button class="info-btn" aria-expanded="false" aria-label="Show details for ${escapeHtml(
          product.name
        )}">Details</button>
      </div>
      <div class="description" hidden>${escapeHtml(product.description)}</div>
    </div>
  `
    )
    .join("");

  // Attach click and keyboard handlers to toggle selection and info
  const cards = productsContainer.querySelectorAll(".product-card");
  cards.forEach((card) => {
    const id = Number(card.dataset.id);

    // mark pre-selected if present
    if (selectedProducts.has(id)) card.classList.add("selected");

    const toggle = () => {
      // find product data from products array
      const product = products.find((p) => p.id === id);
      if (!product) return;

      if (selectedProducts.has(id)) {
        selectedProducts.delete(id);
        card.classList.remove("selected");
      } else {
        selectedProducts.set(id, product);
        card.classList.add("selected");
      }

      renderSelectedProducts();
      saveSelectedProducts();
    };

    card.addEventListener("click", toggle);
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        toggle();
      }
    });

    // Info button toggles description without selecting the card
    const infoBtn = card.querySelector(".info-btn");
    if (infoBtn) {
      infoBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        // Open modal with product details instead of expanding the card
        const id = Number(card.dataset.id);
        const product = products.find((p) => p.id === id);
        if (product) openProductModal(product);
      });
    }
  });
}

/* Product details modal logic */
const modal = document.getElementById("productModal");
const modalTitle = document.getElementById("modalTitle");
const modalBrand = document.getElementById("modalBrand");
const modalBody = document.getElementById("modalBody");

function openProductModal(product) {
  if (!modal) return;
  modalTitle.textContent = product.name || "Product details";
  modalBrand.textContent = product.brand || "";
  modalBody.textContent = product.description || "";
  modal.setAttribute("aria-hidden", "false");
  // trap focus to close button for accessibility
  const closeBtn = modal.querySelector(".modal-close");
  if (closeBtn) closeBtn.focus();
}

function closeProductModal() {
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
}

// Close on backdrop click or data-close
document.addEventListener("click", (e) => {
  const target = /** @type {HTMLElement} */ (e.target);
  if (!modal) return;
  if (modal.getAttribute("aria-hidden") === "true") return;
  if (target.closest && target.closest(".modal-backdrop")) {
    closeProductModal();
  }
});

// Close on close button
if (modal) {
  const closeBtn = modal.querySelector(".modal-close");
  if (closeBtn) closeBtn.addEventListener("click", () => closeProductModal());
}

// Close on ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeProductModal();
});

/* Render selected products list (small badges with remove buttons) */
function renderSelectedProducts() {
  if (!selectedProductsList) return;

  const items = Array.from(selectedProducts.values());
  if (items.length === 0) {
    selectedProductsList.innerHTML = `<div class="placeholder-message">No products selected</div>`;
    return;
  }

  selectedProductsList.innerHTML = items
    .map(
      (p) => `
    <div class="selected-item" data-id="${p.id}">
      <img src="${p.image}" alt="${escapeHtml(p.name)}" />
      <div class="selected-meta">
        <strong>${escapeHtml(p.name)}</strong>
        <div class="brand">${escapeHtml(p.brand)}</div>
      </div>
      <button class="remove-btn" aria-label="Remove ${escapeHtml(
        p.name
      )}">&times;</button>
    </div>
  `
    )
    .join("");

  // attach remove handlers
  selectedProductsList.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const wrapper = e.target.closest(".selected-item");
      if (!wrapper) return;
      const id = Number(wrapper.dataset.id);
      // remove from map
      selectedProducts.delete(id);
      // unmark card in grid if present
      const card = productsContainer.querySelector(
        `.product-card[data-id="${id}"]`
      );
      if (card) card.classList.remove("selected");
      renderSelectedProducts();
      saveSelectedProducts();
    });
  });
}

/* Filter and display products when category changes or user types in search */
if (categoryFilter) categoryFilter.addEventListener("change", applyFilters);
if (searchInput)
  searchInput.addEventListener("input", debounce(applyFilters, 180));

/* Chat form submission handler: retain conversation history and send full context */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const inputEl = document.getElementById("userInput");
  const userInput = inputEl.value.trim();
  if (!userInput) return;

  // Add user message to conversation and render immediately
  conversation.push({ role: "user", content: userInput });
  renderChat();
  inputEl.value = "";

  // Add a temporary assistant placeholder while waiting
  conversation.push({ role: "assistant", content: "Thinking…" });
  renderChat();

  const workerUrl = "https://lorealchatbot.dilyosov.workers.dev/";

  try {
    const res = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: conversation,
        web_search: liveSearchCheckbox ? !!liveSearchCheckbox.checked : false,
      }),
    });

    if (!res.ok)
      throw new Error(`Worker request failed: ${res.status} ${res.statusText}`);

    const contentType = res.headers.get("content-type") || "";
    let assistantText = "";

    if (contentType.includes("application/json")) {
      const data = await res.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        assistantText = data.choices[0].message.content;
      } else if (data.reply) {
        assistantText = data.reply;
      } else if (data.text) {
        assistantText = data.text;
      } else {
        assistantText = JSON.stringify(data);
      }
      // If the worker included structured sources/citations, attach them
      const sources =
        data.sources ||
        data.citations ||
        data.sources_list ||
        (data.meta && data.meta.sources);
      if (sources && Array.isArray(sources) && sources.length > 0) {
        const citationLines = sources.map((s, i) => {
          // each source may be a string (url) or an object {title, url}
          if (typeof s === "string") return `${i + 1}. ${s}`;
          const title = s.title || s.name || s.anchor || s.source || "Source";
          const url = s.url || s.link || s.href || "";
          return url ? `${i + 1}. ${title} — ${url}` : `${i + 1}. ${title}`;
        });
        assistantText += "\n\nSources:\n" + citationLines.join("\n");
      }
    } else {
      assistantText = await res.text();
    }

    // Replace the last assistant placeholder with the real reply
    for (let i = conversation.length - 1; i >= 0; i--) {
      if (
        conversation[i].role === "assistant" &&
        conversation[i].content === "Thinking…"
      ) {
        conversation[i].content = assistantText;
        break;
      }
    }

    renderChat();
  } catch (err) {
    console.error(err);
    // Replace placeholder with error message
    for (let i = conversation.length - 1; i >= 0; i--) {
      if (
        conversation[i].role === "assistant" &&
        conversation[i].content === "Thinking…"
      ) {
        conversation[i].content = `Error: ${err.message}`;
        break;
      }
    }
    renderChat();
  }
});

/* Generate Routine button: collect selected products and ask the Worker/OpenAI to create a routine */
if (generateBtn) {
  generateBtn.addEventListener("click", async () => {
    const items = Array.from(selectedProducts.values());
    if (items.length === 0) {
      conversation.push({
        role: "assistant",
        content: "Please select at least one product to generate a routine.",
      });
      renderChat();
      return;
    }

    // Prepare payload with only needed fields
    const simpleProducts = items.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      description: p.description,
    }));

    // Add a user message describing selected products and intent
    const userPrompt = `Generate a clear, ordered step-by-step routine (morning/evening) using only these products: ${JSON.stringify(
      simpleProducts
    )}. For each step, state which product to use, when to use it, why, and any cautions.`;

    // store the prompt but keep it hidden from the chat UI
    conversation.push({ role: "user", content: userPrompt, hidden: true });
    // show immediate feedback
    conversation.push({
      role: "assistant",
      content: "Generating personalized routine…",
    });
    renderChat();

    const workerUrl = "https://lorealchatbot.dilyosov.workers.dev/";

    try {
      const res = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversation,
          web_search: liveSearchCheckbox ? !!liveSearchCheckbox.checked : false,
        }),
      });

      if (!res.ok)
        throw new Error(
          `Worker request failed: ${res.status} ${res.statusText}`
        );

      const contentType = res.headers.get("content-type") || "";
      let routineText = "";

      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          routineText = data.choices[0].message.content;
        } else if (data.reply) {
          routineText = data.reply;
        } else if (data.text) {
          routineText = data.text;
        } else {
          routineText = JSON.stringify(data);
        }
        const sources =
          data.sources ||
          data.citations ||
          data.sources_list ||
          (data.meta && data.meta.sources);
        if (sources && Array.isArray(sources) && sources.length > 0) {
          const citationLines = sources.map((s, i) => {
            if (typeof s === "string") return `${i + 1}. ${s}`;
            const title = s.title || s.name || s.anchor || s.source || "Source";
            const url = s.url || s.link || s.href || "";
            return url ? `${i + 1}. ${title} — ${url}` : `${i + 1}. ${title}`;
          });
          routineText += "\n\nSources:\n" + citationLines.join("\n");
        }
      } else {
        routineText = await res.text();
      }

      // Replace the last assistant placeholder with the real routine
      for (let i = conversation.length - 1; i >= 0; i--) {
        if (
          conversation[i].role === "assistant" &&
          conversation[i].content === "Generating personalized routine…"
        ) {
          conversation[i].content = routineText;
          break;
        }
      }

      renderChat();
    } catch (err) {
      console.error(err);
      for (let i = conversation.length - 1; i >= 0; i--) {
        if (
          conversation[i].role === "assistant" &&
          conversation[i].content === "Generating personalized routine…"
        ) {
          conversation[i].content = `Error generating routine: ${err.message}`;
          break;
        }
      }
      renderChat();
    }
  });
}

// Clear selections button handler
const clearBtn = document.getElementById("clearSelections");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    selectedProducts.clear();
    // unmark any selected cards
    productsContainer
      .querySelectorAll(".product-card.selected")
      .forEach((c) => c.classList.remove("selected"));
    renderSelectedProducts();
    saveSelectedProducts();
  });
}
