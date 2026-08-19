import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicHomeMarkup } from "../../../app/components/public/PublicHomeMarkup";
import { EDITORIAL_VENUES } from "../../../app/data/editorial-venues";
import { createEditorialHomeCatalogSummary } from "../../../app/modules/home-catalog-summary";
import { PublicHelpView } from "../../../app/routes/public-help";
import { PublicHomeView } from "../../../app/routes/public-home";
import {
  PASSWORD_ERROR_MESSAGE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
} from "../../../password-policy.mjs";

const root = resolve(import.meta.dirname, "../../..");
const editorialHomeCatalogSummary = createEditorialHomeCatalogSummary(EDITORIAL_VENUES);

function EditorialHomeView() {
  return <PublicHomeView catalogSummary={editorialHomeCatalogSummary} />;
}

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
  it("cuts home runtime ownership over to hydrated React without legacy sentinels", async () => {
    const legacy = await legacyDocument("index.html");
    const rendered = documentFor(renderToStaticMarkup(<EditorialHomeView />));

    expect(legacy.querySelector('script[src^="app.js?v="]')).not.toBeNull();
    expect(rendered.querySelector('script[src*="app.js"]')).toBeNull();
    expect(rendered.querySelector("main")?.getAttribute("data-react-route")).toBe("home");
    expect(rendered.querySelectorAll("#guide, #categories, #popular, #collections, #cities, #site-footer")).toHaveLength(6);
    expect(rendered.querySelectorAll("#popular .home-featured-venue-card")).toHaveLength(3);
    expect(rendered.querySelectorAll('#popular a[href^="/venue/"]')).not.toHaveLength(0);
    expect(rendered.querySelector('#venue-search[action="/catalog"][method="get"] input[name="q"]')).not.toBeNull();
    expect(rendered.querySelector('#venue-search select[name="city"]')).not.toBeNull();
    expect(rendered.querySelector("#home-submission-link")?.getAttribute("href")).toBe("/?open=submission#guide");
    expect(rendered.querySelector("#categories-view, #catalog-view, #profile-view, #venue-dialog, #auth-dialog, #register-dialog, #review-dialog, #submission-dialog, #favorites-dialog")).toBeNull();
  });

  it("keeps the ordered legacy DOM contract for help", async () => {
    const legacy = await legacyDocument("help.html");
    const rendered = documentFor(renderToStaticMarkup(<PublicHelpView />));
    const selectors = ["#content", "#faq", "#partners", "#rules", "#privacy", "#terms"];
    const textSelectors = ["#page-title", "#faq-title", "#partners-title", "#rules-title", "#privacy-title", "#terms-title"];

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

  it("keeps legacy and React registration constraints aligned with the shared password policy", async () => {
    const legacy = await legacyDocument("index.html");
    const rendered = documentFor(renderToStaticMarkup(<PublicHomeMarkup />));

    for (const document of [legacy, rendered]) {
      const input = document.querySelector<HTMLInputElement>('#register-form [name="password"]');
      expect(input?.minLength).toBe(PASSWORD_MIN_LENGTH);
      expect(input?.pattern).toBe(PASSWORD_PATTERN);
      expect(input?.title).toBe(PASSWORD_ERROR_MESSAGE);
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
