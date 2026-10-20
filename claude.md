- read README.md first.
- the app is upstream OOYE (Node, cloned at build time) plus the supervisor in `bottle/` (plain Node, no
  dependencies). keep `bottle/` dependency-free and don't patch OOYE.
- `just test` runs the integration tests under the OpenHost test harness; in the workbench, run them with the
  `OPENHOST_*`/`BOTTLE_*` vars unset.
- never use em dashes.
