---
"@dudousxd/nestjs-notifications-preferences": patch
---

When an app imports both `PreferencesModule.forRoot()` and `PreferencesModule.forCenter()`, the preference center's gate now decides deliveries whichever module is imported first, as documented ("forCenter replaces the simple opt-out gate"). Before, the module imported first provided the gate, so importing `forRoot()` first left the opt-out gate in charge and preference-center toggles were ignored. Apps that import only one of the two are unaffected.
