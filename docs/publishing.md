# Publishing ADX

For installation and usage, start with the [README](../README.md).

The package publishes to npm automatically from `main` via GitHub Actions
(see [the publish workflow](https://github.com/Saifer88/project_adx_0/blob/main/.github/workflows/publish.yml)).
Each push publishes only when the version in `package.json` is not already on npm.

## Maintainer Setup

The publish workflow authenticates to npm with a repository secret named
`NPM_TOKEN`. Create it once:

1. **Create the npm token.** Sign in at [npmjs.com](https://www.npmjs.com/),
   open **Access Tokens** from your avatar menu, and choose **Generate New
   Token > Granular Access Token**. Configure it so CI can publish unattended:
   - **First publish (bootstrap).** If `project-adx-0` does not exist on npm yet,
     you cannot scope a token to it until it has been published once. Pick one of:
     - Create a token with **Read and write** on **all packages** (or all under
       your account), let the first push to `main` publish, then immediately
       replace it with a package-scoped token and update the `NPM_TOKEN` secret; or
     - Publish once manually from your machine (`npm run build` then `npm publish`),
       then use a package-scoped token for CI from then on.
   - **After the package exists**, scope the token to `project-adx-0`
     with **Read and write** permission, and set an expiry.
   - **Enable "Bypass two-factor authentication (2FA)".** If your account
     enforces 2FA on publish and the token does not bypass it, `npm publish`
     in Actions fails with an OTP prompt the workflow cannot answer. See npm's
     [CI/CD token guide](https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow).
2. **Copy the token value.** npm shows it only once. Treat it like a password;
   do not paste it into code, commits, or chat.
3. **Add it as a GitHub Actions secret.** In the GitHub repo, go to
   **Settings > Secrets and variables > Actions > New repository secret**, name
   it exactly `NPM_TOKEN`, paste the token value, and save.

## Releases

Pushing to `main` runs the workflow and publishes when the version is new.
To release a new version, bump `version` in `package.json` and push to `main`;
re-pushing an already-published version is a clean skip. Rotate the token by
generating a new one on npm and updating the `NPM_TOKEN` secret.