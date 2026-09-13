# GitHub Pages

The migration target is `https://niharnm.github.io/grok-bridge/`. The source is
`docs/`, deployed by `.github/workflows/pages.yml` after changes reach `main`.
The workflow stages an explicit list of public files, excluding repository
documentation, environment files, and local deployment metadata.

## Activation

Migration is prepared, but the public site still uses its existing host until
the account-domain routing is resolved and Pages is verified.

The account's `niharnm.github.io` repository currently sets `niharm.me` as its
Pages custom domain. GitHub applies that domain to project sites, including
Grok Bridge. The resulting `/grok-bridge/` route currently returns 404 on the
portfolio's host. Setting an empty custom domain on this project does not
override that inheritance.

To use the target URL, the maintainer must remove the obsolete custom-domain
setting and source `CNAME` from the account's Pages repository. This changes
the root GitHub URL and inherited project redirects, so it requires separate
approval. Portfolio DNS and Vercel hosting do not need to change. Alternatively,
assign this project its own custom subdomain and point that subdomain to
GitHub Pages, then update the canonical URLs and site path accordingly.

After resolving routing, select **GitHub Actions** in this repository's Pages
settings. Merge the migration into `main` and run **GitHub Pages**. Verify the
home page, assets, custom 404, and sitemap over public HTTPS before changing
the repository homepage or retiring the previous deployment.

The previous host's Google Search Console and IndexNow submissions do not
establish ownership or indexing of the new URL. Verify the new URL-prefix
property and submit its sitemap after deployment. A project-level
`/grok-bridge/robots.txt` is not a domain-root crawler policy; use the sitemap
submission and page metadata for discovery.

See GitHub's [domain inheritance rules](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages)
and [Actions publishing documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
