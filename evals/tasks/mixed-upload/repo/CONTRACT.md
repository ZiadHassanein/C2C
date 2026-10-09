# Agreed upload boundaries

Only authenticated contributors belonging to a project may request uploads for that project; requests naming another project must fail server-side. Browser-hidden controls are not authorization. Filenames and MIME values are untrusted client input.
Accept JPEG/PNG only, maximum 8 MiB per image. Verify actual file bytes, dimensions and decode success before serving. Use server-generated keys scoped to the authorized project; quarantine new uploads and reject invalid content. No object becomes publicly visible merely because upload completed.
A validated image can enter the public exhibit only when web rights and required credit are recorded and the editor approves the observed image/captions. For Asset A, rights discovery can proceed while it stays private. For Asset B, existing permission alone does not prove content or caption accuracy.
Existing projects may keep private previews. Publication approval is a separate project-owner action. Unknown deployment/storage configuration requires bounded read-only discovery before giving exact rollout commands.
