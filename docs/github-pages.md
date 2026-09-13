# GitHub Pages

The website is live at [niharnm.github.io/grok-bridge](https://niharnm.github.io/grok-bridge/).
Its source is `docs/`. The GitHub Actions workflow in
`.github/workflows/pages.yml` publishes changes from `main` and stages ten
named public files, excluding repository documentation, environment files,
and local deployment metadata.

## Completed migration

[PR #2](https://github.com/niharnm/grok-bridge/pull/2) merged as `6c2ce49` on
September 13, 2026. The [Pages deployment](https://github.com/niharnm/grok-bridge/actions/runs/34786756151)
succeeded with HTTPS enforced. Eighteen public HTTP checks passed, including
source-byte comparisons, the nested custom 404, canonical and sitemap URLs,
HTTP and trailing-slash redirects, and exclusion of environment/configuration
files and source maps.

The account Pages repository previously assigned `niharm.me` to all project
sites through domain inheritance. With explicit approval, that obsolete
setting was removed; GitHub also removed its source `CNAME` in
[commit eb00264](https://github.com/niharnm/niharnm.github.io/commit/eb00264d5191bed5003d1a50323375e7064e81c3).
The source branch remains `develop`. No portfolio DNS or hosting settings
changed. Both portfolio URLs retained identical HTML, HTTP status, Vercel
hosting and redirect behavior in the before/after comparison.

## Publishing changes

Merge website changes into `main`; the Pages workflow deploys them
automatically. Its manual **Run workflow** action is also available on `main`.
Verify the public home, assets, a nonexistent nested route, and sitemap after
each relevant change. Keep paths under `/grok-bridge/`; the 404 page uses
absolute project paths so recovery works from any missing nested URL.

The previous host's Google Search Console and IndexNow submissions do not
establish ownership or indexing of this URL. New-property setup and the
previous-host redirect are tracked in the [distribution record](launch.md#distribution-record).
A project-level `/grok-bridge/robots.txt` is not a domain-root crawler policy;
use the sitemap submission and page metadata for discovery.

## Previous URL

The previous `grok-bridge-henna.vercel.app` address now returns permanent
HTTP 308 redirects to Pages. Root, asset, nested missing-route, and query-string
checks passed. The old address serves only redirects; the website content
is hosted on GitHub Pages.

The deployed routing source is [legacy-redirect.json](legacy-redirect.json),
using Vercel's [Build Output API](https://vercel.com/docs/build-output-api/configuration).
Ordinary static deployments did not apply the redirect configuration during
migration, so use the verified prebuilt procedure below from the repository
root. First ensure `docs/.vercel/project.json` identifies the existing
`grok-bridge` project. The generated output must contain only `config.json`
and `static/favicon.svg`.

```sh
mkdir -p docs/.vercel/output/static
cp docs/legacy-redirect.json docs/.vercel/output/config.json
cp docs/favicon.svg docs/.vercel/output/static/favicon.svg
vercel deploy --prebuilt --cwd docs --prod --yes --scope niharnsm-8472s-projects
```

Normal website updates use GitHub Actions and require no Vercel deployment.

See GitHub's [domain inheritance rules](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages)
and [Actions publishing documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
