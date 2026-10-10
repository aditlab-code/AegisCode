# 0008. Automated Typed Contract Generation

We decided to generate TypeScript interfaces directly from Go struct definitions using a lightweight generator (`tygo`), establishing a single source of truth for the API contract. Any backward-incompatible backend payload change will immediately fail the frontend build (`npm run build`), eliminating silent runtime contract mismatches.
