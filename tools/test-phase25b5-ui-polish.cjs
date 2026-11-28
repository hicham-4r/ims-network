/* eslint-disable @typescript-eslint/no-require-imports -- Offline source and component regression */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const jsx = (type, props) => ({type, props});
function load(file, imports) {
  const result = ts.transpileModule(read(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}, fileName: file, reportDiagnostics: true});
  assert.equal(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const exports = {};
  vm.runInNewContext(result.outputText, {exports, require: name => name === "react/jsx-runtime" ? {jsx, jsxs: jsx} : (assert.ok(Object.hasOwn(imports, name), name), imports[name])}, {filename: file});
  return exports;
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
const form = load("src/app/(app)/moderation/forms.tsx", {react: {useActionState: () => [{message: ""}, () => {}, false]}, "./actions": {}});
for (const action of ["GRANT", "REVOKE"]) {
  const all = nodes(form.ReviewerRoleForm({targetUserId: "fixture-member", action}));
  const buttons = all.filter(n => n.type === "button");
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].props.children, action === "GRANT" ? "Grant moderator" : "Revoke moderator");
  assert.equal(buttons[0].props.type, "submit");
  assert.equal(all.find(n => n.props.name === "action").props.value, action);
  assert.equal(all.find(n => n.props.name === "targetUserId").props.value, "fixture-member");
  assert.equal(all.find(n => n.props.name === "password").props.required, true);
  assert.equal(all.find(n => n.props.name === "confirmed").props.required, true);
}
const states = []; let index = 0;
const react = {Suspense: "Suspense", useState: initial => {
  const i = index++; if (i >= states.length) states.push(initial);
  return [states[i], value => {states[i] = typeof value === "function" ? value(states[i]) : value;}];
}};
const signin = load("src/app/(auth)/sign-in/page.tsx", {react, "next/link": "Link", "next/navigation": {useRouter: () => ({})}, "lucide-react": {Eye: "Eye", EyeOff: "EyeOff"}, "@/lib/auth-client": {}, "@/components/ui/button": {Button: "Button"}, "@/components/ui/input": {Input: "Input"}, "@/components/ui/card": {Card: "Card", CardContent: "CardContent", CardDescription: "CardDescription", CardHeader: "CardHeader", CardTitle: "CardTitle"}, "@/components/ui/field": {Field: "Field", FieldDescription: "FieldDescription", FieldGroup: "FieldGroup", FieldLabel: "FieldLabel"}});
const render = () => {index = 0; return nodes(signin.default());};
let all = render();
const password = () => all.find(n => n.props.id === "password").props;
const toggle = () => all.find(n => n.props["aria-controls"] === "password").props;
assert.equal(password().type, "password"); assert.equal(toggle().type, "button");
assert.equal(password().autoComplete, "current-password"); assert.equal(toggle()["aria-label"], "Show password");
password().onChange({target: {value: "fixture-secret"}}); toggle().onClick(); all = render();
assert.equal(password().type, "text"); assert.equal(password().value, "fixture-secret"); assert.equal(toggle()["aria-label"], "Hide password");
toggle().onClick(); all = render(); assert.equal(password().type, "password"); assert.equal(password().value, "fixture-secret");
const page = read("src/app/(app)/admin/accounts/[id]/page.tsx");
assert.match(page, /configuredOwnerId\(\) === session.user.id && account.userId !== session.user.id/);
assert.match(page, /account.moderatorUserId !== null \|\| \(account.role === "MEMBER" && account.status === "ACTIVE"\)/);
assert.match(page, /action=\{account.moderatorUserId !== null \? "REVOKE" : "GRANT"\}/);
assert.match(read("src/server/account-state/admin-page.ts"), /leftJoin\(moderationReviewers, eq\(moderationReviewers.userId, user.id\)\)/);
assert.match(read("src/app/(app)/moderation/actions.ts"), /revalidatePath\("\/admin\/accounts\/\[id\]","page"\)/);
const mutation = read("src/server/messaging/moderation.ts");
assert.match(mutation, /actor!==owner \|\| targetUserId===owner/); assert.match(mutation, /verifyPassword/);
assert.match(mutation, /confirmed:z.literal\(true\)/); assert.match(mutation, /t.role='MEMBER' AND t.status='ACTIVE'/);
console.log("PHASE25B5_UI_POLISH PASS (mocked components and structural guards; no browser or live database)");
