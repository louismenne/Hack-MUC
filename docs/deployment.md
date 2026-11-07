# Production deployment

The project uses the existing Vercel Git integration for `louismenne/Hack-MUC`, targeting **hackmuc** in **louismennes-projects** at https://hackmuc.vercel.app. There is no GitHub Actions deployment workflow.

`vercel.json` configures the build and output directory. Before deployment, run `npm run typecheck`, `npm test`, and `npm run build`.

Vercel Production needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. `ANTHROPIC_API_KEY` is optional and enables AI drafting. Keep secret keys server-side; never commit environment files or add secrets to `VITE_*` variables.

A successful Git push does not guarantee a successful deployment. Vercel Hobby restricts collaboration for private repositories and requires the commit author to be the Hobby owner. Resolve author/team access in Vercel before expecting another contributor's push to deploy. See [Vercel collaboration requirements](https://vercel.com/docs/deployments/troubleshoot-project-collaboration).

After deployment, check the sign-in screen and verify anonymous policy API requests return 401. Then verify an invited account can sign in and use its assigned role. Database migrations are separate from deployment.
