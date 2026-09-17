# ChatGPT Chat-mode Infrastructure

**English | [中文](README.zh-CN.md)**

A collection of reusable infrastructure patterns for extending ordinary ChatGPT Chat workflows with controlled external execution and verification.

This public-source snapshot intentionally contains only portable implementations, examples, templates, and generalized architecture notes. Private runtime state, production mailboxes, binary transport data, verified production baselines, project-specific provenance, and real QA evidence are intentionally excluded.

## Included kits

### 1. Lark / Feishu document bridge

A reference architecture for connecting Chat workflows to Lark/Feishu through a controlled local execution bridge. The public snapshot includes the portable migration/configuration layer only; production watchers, real mailbox state, OAuth state, and verified production baselines are not published.

- [English usage guide](infrastructures/lark-feishu-docs-bridge/USAGE_GUIDE.md)
- [中文使用指南](infrastructures/lark-feishu-docs-bridge/USAGE_GUIDE.zh-CN.md)

### 2. Playwright browser QA for Chat mode

A portable GitHub Actions + Playwright kit for browser-based QA loops: build a candidate, launch a browser, exercise deterministic states, capture runtime errors and screenshots, compare browser baselines, and return evidence through CI artifacts.

- [English usage guide](infrastructures/chatmode-playwright-browser-qa/USAGE_GUIDE.md)
- [中文使用指南](infrastructures/chatmode-playwright-browser-qa/USAGE_GUIDE.zh-CN.md)

### 3. GitHub delivery bridge

Reusable scripts and templates for release preflight, GitHub CLI verification, prerelease publication, and project-delivery workflows.

- [English usage guide](infrastructures/github-delivery-gh-bridge/USAGE_GUIDE.md)
- [中文使用指南](infrastructures/github-delivery-gh-bridge/USAGE_GUIDE.zh-CN.md)

## Security boundary

This repository is designed to be safe to publish as source code. Do not use the public repository itself as a runtime mailbox or binary carrier. Keep credentials, OAuth material, request/response payloads, screenshots containing private data, test-account data, and production execution state in a separate private runtime repository or another private backend.

See [`SECURITY.md`](SECURITY.md) before adapting any kit for production use. [中文版](SECURITY.zh-CN.md)

## License

No open-source license is granted by this snapshot. Publication makes the source viewable; it does not grant permission to copy, modify, redistribute, commercialize, or incorporate the source into another product. Any additional rights require explicit permission from the copyright holder.


## Support / Sponsor

If this project is useful to you, you can [support my work with crypto](https://github.com/ooo0-0ooo/ooo0-0ooo/blob/main/SUPPORT.md). Contributions are voluntary; check the token, network, and address before sending.
