# Task Queue

Purpose:  
Single source of truth for what MittenIQ work is happening now and next.

Rules:
- Keep tasks small and specific.
- Move completed items to DONE.
- Do not delete history.

---

# CURRENT (Active Work)

Phase 1 — Intake System Stabilization

- Validate deterministic sheet detection across multiple real drawing sets
- Improve sheet confidence logic beyond current placeholder scoring
- Implement clear low-confidence handling workflow
- Improve document classification accuracy
- Expand drawing discipline detection
- Improve spec section detection

Infrastructure stabilization

- Resolve Supabase TLS connection failure in Vercel production environment
- Restore production login functionality

Improve specification document intelligence

- robust spec section detection
- front-end document classification
- heading extraction
- spec title detection

---

# NEXT (Immediate Follow-Up)

- Improve intake report trust messaging
- Add low-confidence highlighting for sheet detection
- Expand document intelligence architecture
- Expand LLM-assisted intake refinement logic
- Introduce structured document understanding layer

---

# UPCOMING (Near-Term Build)

- Folder organization system
- Addendum detection
- Document version tracking
- Replace localStorage purchased-functions stub with database persistence
- Implement real project efficiency tracking
- Expand agent report hub

---

# PARKED / IDEAS

- Vendor RFQ automation
- Automated estimating assistance
- Cost database integration
- Advanced estimating workflows

---

# DONE

- Documentation system created
- Authentication system implemented
- Upload pipeline verified
- Cloudflare R2 storage integrated
- Intake analyzer implemented
- Sheet generation implemented
- Secure file access route implemented
- GitHub repository connected to Vercel
- Production deployment pipeline established
- Project workspace restructured around agent strip + Purchased Functions hub
- Upload list reduced to status-only display
- Temporary purchased-functions localStorage flow implemented
- Estimating Assistant purchase page created
- Combined Intake + Sheet Setup workflow implemented
- Intake page estimator-focused redesign
- Open Full File button added to intake report
- Per-row Open Page functionality added
- Sheet list expanded with richer metadata
- pdfjs-dist worker failure diagnosed
- pdfjs-dist extraction layer replaced with pdf-parse
- Server-side PDF text extraction verified
- Deterministic sheet detection validated with real drawing set
- Optional LLM intake refinement layer implemented
- Development secrets rotated (Supabase, R2, OpenAI)