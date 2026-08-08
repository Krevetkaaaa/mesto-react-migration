import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicHomeMarkup } from "../../../app/components/public/PublicHomeMarkup";
import { PublicHelpView } from "../../../app/routes/public-help";
import { PublicHomeView } from "../../../app/routes/public-home";

const root = resolve(import.meta.dirname, "../../..");

function documentFor(markup: string) {
  return new DOMParser().parseFromString(`<!doctype html><body>${markup}</body>`, "text/html");
}

function legacyDocumentFor(markup: string) {
  return new DOMParser().parseFromString(markup, "text/html");
}

function normalizedText(element: Element | null) {
  return (element?.textContent || "").replace(/\s+/g, " ").trim();
}

function inventory(document: Document) {
  return [...document.body.querySelectorAll("*")]
    .filter((element) => !element.matches('link[rel="preload"]'))
    .map((element) => {
    const attributes = [...element.attributes]
      .filter((attribute) => attribute.name !== "data-react-route")
      .map((attribute) => `${attribute.name}=${attribute.value}`)
      .sort()
      .join(";");

    return `${element.tagName.toLowerCase()}[${attributes}]`;
  });
}

function landmarkInventory(document: Document) {
  return [...document.body.querySelectorAll("header,main,nav,footer,section,form,dialog,[role]")]
    .map((element) => `${element.tagName.toLowerCase()}#${element.id}.${[...element.classList].join(".")}:${element.getAttribute("role") || ""}`);
}

function directTextInventory(document: Document) {
  return [...document.body.querySelectorAll("*")]
    .filter((element) => !element.matches('link[rel="preload"]'))
    .map((element) => {
      const directText = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      return directText ? `${element.tagName.toLowerCase()}:${directText}` : null;
    })
    .filter((entry): entry is string => entry !== null);
}

async function legacyDocument(filename: string) {
  return legacyDocumentFor(await readFile(resolve(root, filename), "utf8"));
}

describe("public JSX structural parity", () => {
  it.each([
    ["home", "index.html", PublicHomeView, ["#guide", "#categories", "#popular", "#site-footer", "#venue-search", "#venue-dialog"], ["#guide-title", "#categories-title", "#popular-title"], ["#platform"]],
    ["help", "help.html", PublicHelpView, ["#content", "#faq", "#partners", "#rules", "#privacy", "#terms"], ["#page-title", "#faq-title", "#partners-title", "#rules-title", "#privacy-title", "#terms-title"], []],
  ])("keeps the ordered legacy DOM contract for %s", async (_name, legacyFile, Markup, selectors, textSelectors, retiredSelectors) => {
    const legacy = await legacyDocument(legacyFile);
    const rendered = documentFor(renderToStaticMarkup(<Markup />));

    for (const selector of retiredSelectors) {
      const retired = legacy.querySelector(selector);
      expect(retired, `${selector} must exist in the legacy source before retirement`).not.toBeNull();
      expect(retired?.hasAttribute("hidden"), `${selector} must already be hidden in the legacy source`).toBe(true);
      expect(rendered.querySelector(selector), `${selector} must not be serialized by React SSR`).toBeNull();
      retired?.remove();
    }

    if (_name === "home") {
      const legacyExtraVenueCards = [...legacy.querySelectorAll("#popular .venue-card.is-extra")];
      expect(legacyExtraVenueCards, "the characterized hidden inventory must stay explicit").toHaveLength(28);
      expect(legacyExtraVenueCards.every((card) => card.hasAttribute("hidden")), "retired venue inventory must already be hidden").toBe(true);
      expect(rendered.querySelectorAll("#popular .venue-card.is-extra"), "hidden venue inventory must not be serialized by React SSR").toHaveLength(0);
      legacyExtraVenueCards.forEach((card) => card.remove());

      const legacyAppScript = legacy.querySelector('script[src^="app.js?v="]');
      const renderedAppScript = rendered.querySelector('script[src^="app.js?v="]');
      expect(legacyAppScript?.getAttribute("src"), "the frozen legacy document keeps its original asset version").toBe("app.js?v=ui-motion-2");
      expect(renderedAppScript?.getAttribute("src"), "the migrated home must invalidate the changed legacy asset").toBe("app.js?v=ui-motion-3");
      legacyAppScript?.setAttribute("src", renderedAppScript?.getAttribute("src") || "");

      const legacyCatalog = legacy.querySelector("#catalog-view");
      const renderedCatalog = rendered.querySelector("#catalog-view");
      expect(legacyCatalog, "legacy catalog fallback must exist before retirement").not.toBeNull();
      expect(renderedCatalog, "home must retain the sentinel required by legacy view switching").not.toBeNull();
      if (!legacyCatalog || !renderedCatalog) throw new Error("Catalog retirement contract is incomplete");
      expect(legacyCatalog.hasAttribute("hidden"), "legacy catalog fallback must already be hidden").toBe(true);
      expect(renderedCatalog.hasAttribute("hidden"), "home catalog sentinel must remain hidden").toBe(true);
      expect(renderedCatalog.hasAttribute("aria-labelledby"), "empty sentinel must not reference a retired title").toBe(false);
      expect(renderedCatalog.childElementCount, "retired in-page catalog UI must not be serialized").toBe(0);
      for (const selector of ["#catalog-hero", "#catalog-title", ".catalog-controls", "#catalog-grid", "#catalog-load-more"]) {
        expect(rendered.querySelector(selector), `${selector} belongs only to a React catalog document`).toBeNull();
      }
      legacyCatalog.replaceChildren();
      legacyCatalog.removeAttribute("aria-labelledby");
    }

    expect(inventory(rendered)).toEqual(inventory(legacy));
    expect(landmarkInventory(rendered)).toEqual(landmarkInventory(legacy));
    expect(directTextInventory(rendered)).toEqual(directTextInventory(legacy));

    for (const selector of selectors) {
      expect(rendered.querySelectorAll(selector)).toHaveLength(legacy.querySelectorAll(selector).length);
    }
    for (const selector of textSelectors) {
      expect(normalizedText(rendered.querySelector(selector))).toBe(normalizedText(legacy.querySelector(selector)));
    }
  });

  it("contains no unsafe HTML injection escape hatch", async () => {
    const publicSources = await Promise.all([
      "app/components/public/PublicHomeMarkup.tsx",
      "app/components/public/PublicHelpMarkup.tsx",
      "app/routes/public-home.tsx",
      "app/routes/public-help.tsx",
    ].map((filename) => readFile(resolve(root, filename), "utf8")));

    expect(publicSources.join("\n")).not.toMatch(/dangerouslySetInnerHTML\s*=|\.innerHTML\s*=/);
  });

  it("keeps standalone catalog ownership free of hidden home and legacy dialogs", () => {
    const rendered = documentFor(renderToStaticMarkup(
      <PublicHomeMarkup
        standalone
        catalogVisible
        catalogContent={<div className="catalog-inner"><div id="catalog-grid">React catalog</div></div>}
      />,
    ));

    expect(rendered.querySelector("main")?.getAttribute("data-react-route")).toBe("catalog");
    expect(rendered.querySelector("#catalog-view")?.hasAttribute("hidden")).toBe(false);
    expect(rendered.querySelector("#catalog-grid")?.textContent).toBe("React catalog");
    expect(rendered.querySelector("#guide, #profile-view, #venue-dialog, #auth-dialog")).toBeNull();
  });
});
