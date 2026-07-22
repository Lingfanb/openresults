# OpenResults

A public, standalone library of research results with inspectable media, explicit scope, and visible limitations.

## Add a result

1. Create `results/<slug>/index.html` and copy every public asset into that directory.
2. Add one entry to `data/results.json`. The homepage automatically groups, sorts, searches, and filters it.
3. Run the local checks:

```bash
node scripts/validate-catalog.mjs
python scripts/audit-public-site.py .
```

The published site contains copied public artifacts only. It does not connect to private report repositories or runtime services.
