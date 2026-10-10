import { describe, it, expect } from "vitest";
import { parseStructure } from "../src/structure/parser.js";
import { emitHtml } from "../src/codegen/html.js";
import { makeCtx } from "./helpers.js";

describe("emitHtml", () => {
  it("resolves interpolation text at build time", () => {
    const ast = parseStructure("<h2>{{name}}</h2>", "structure.adx");
    const { html } = emitHtml(ast, makeCtx({ state: { name: "Ada" } }));
    expect(html).toContain(">Ada<");
    expect(html).not.toContain("{{");
  });

  it("resolves :prop bindings into real attributes", () => {
    const ast = parseStructure(
      '<img :src="avatar" :alt="name" .avatar>',
      "structure.adx",
    );
    const { html } = emitHtml(
      ast,
      makeCtx({ state: { avatar: "/ada.png", name: "Ada" } }),
    );
    expect(html).toContain('src="/ada.png"');
    expect(html).toContain('alt="Ada"');
    expect(html).toMatch(/\/>\s*$/);
  });

  it("omits a falsy :if element (empty bio)", () => {
    const ast = parseStructure('<p :if="bio" .bio>{{bio}}</p>', "structure.adx");
    const { html } = emitHtml(ast, makeCtx({ state: { bio: "" } }));
    expect(html).toBe("");
  });

  it("renders a truthy :if element", () => {
    const ast = parseStructure('<p :if="bio" .bio>{{bio}}</p>', "structure.adx");
    const { html } = emitHtml(ast, makeCtx({ state: { bio: "Hello" } }));
    expect(html).toContain(">Hello<");
    expect(html).toContain('class="bio"');
  });

  it("renders the :else branch when :if is falsy", () => {
    const src = '<p :if="bio">yes</p><p :else>no</p>';
    const { html } = emitHtml(
      parseStructure(src, "structure.adx"),
      makeCtx({ state: { bio: "" } }),
    );
    expect(html).toContain(">no<");
    expect(html).not.toContain(">yes<");
  });

  it("unrolls :for over the loop scope", () => {
    const src = '<ul><li :for="(t, i) in tags" :key="t.id">{{t.label}}</li></ul>';
    const { html } = emitHtml(
      parseStructure(src, "structure.adx"),
      makeCtx({
        state: {
          tags: [
            { id: 1, label: "A" },
            { id: 2, label: "B" },
          ],
        },
      }),
    );
    expect(html).toContain(">A<");
    expect(html).toContain(">B<");
    expect((html.match(/<li/g) ?? []).length).toBe(2);
  });

  it("emits a slot placeholder with data-adx-slot", () => {
    const { html } = emitHtml(
      parseStructure("<slot actions .actions />", "structure.adx"),
      makeCtx(),
    );
    expect(html).toContain('data-adx-slot="actions"');
    expect(html).toContain('class="actions"');
  });

  it("scopes owned elements with data-adx-c and bound nodes with data-adx-b", () => {
    const ctx = makeCtx({ state: { name: "Ada", avatar: "/a.png" } });
    const ast = parseStructure(
      '<article .card @click="onClick"><img :src="avatar"></article>',
      "structure.adx",
    );
    const { html, hooks } = emitHtml(ast, ctx);
    expect(html).toContain(`data-adx-c="${ctx.scopeId}"`);
    // The instance root (top-level owned element) carries data-adx-i.
    expect(html).toContain(`data-adx-i="i0"`);
    // Hook ids are instance-scoped: `${scope}-i<ordinal>-<n>`.
    expect(html).toContain(`data-adx-b="${ctx.scopeId}-i0-0"`);
    expect(html).toContain(`data-adx-b="${ctx.scopeId}-i0-1"`);
    // article has the @click event, img has a binding.
    expect(hooks[0].events).toEqual([{ event: "click", handler: "onClick" }]);
    expect(hooks[1].bindings).toEqual(["src"]);
  });

  it("leaves zero {{ in the full UserCard output", () => {
    const ast = parseStructure(
      `<article .card @click="onClick">
        <img :src="avatar" :alt="name" .avatar>
        <div .content>
          <h2 .name>{{name}}</h2>
          <p .role>{{role}}</p>
          <p :if="bio" .bio>{{bio}}</p>
        </div>
        <slot actions .actions />
      </article>`,
      "structure.adx",
    );
    const { html } = emitHtml(ast, makeCtx());
    expect(html).not.toContain("{{");
    expect(html).toContain(">Engineer<");
    expect(html).toContain('src="/ada.png"');
  });
});
