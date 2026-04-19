# Working Rule: Do Not Restart the Configurator

Do not create a second configurator.
Do not restart the project from scratch.
Do not introduce a parallel frontend or parallel backend for the same purpose.

The repository already contains a working configurator prototype.

From now on, all work must follow this rule:

The existing configurator must be evolved incrementally toward the accepted V1 baseline and later core integration.

This means:
- preserve the current working project
- extend it gradually
- keep changes additive and backward-compatible where possible
- do not duplicate the catalog model
- do not duplicate the offer/draft model
- do not introduce a second competing architecture for the same UI flow

Allowed:
- additive model evolution
- additive DTO evolution
- additive API alignment
- refactoring toward accepted service contracts
- incremental UI evolution
- replacing local/mock service implementations later

Not allowed:
- building a second configurator
- replacing the current project with a new empty scaffold
- creating parallel domain models for the same business flow
- treating the current prototype as disposable throwaway code
