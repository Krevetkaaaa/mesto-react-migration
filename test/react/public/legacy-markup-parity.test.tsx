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
    ["home", "index.html", PublicHomeView, ["#guide", "#categories", "#popular", "#site-footer", "#venue-search", "#venue-dialog"], ["#guide-title", "#categories-title", "#popular-title"]],
    ["help", "help.html", PublicHelpView, ["#content", "#faq", "#partners", "#rules", "#privacy", "#terms"], ["#page-title", "#faq-title", "#partners-title", "#rules-title", "#privacy-title", "#terms-title"]],
  ])("keeps the ordered legacy DOM contract for %s", async (_name, legacyFile, Markup, selectors, textSelectors) => {
    const legacy = await legacyDocument(legacyFile);
    const rendered = documentFor(renderToStaticMarkup(<Markup />));

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
