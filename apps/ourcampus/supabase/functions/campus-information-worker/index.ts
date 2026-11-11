import { createInformationWorker } from '../_shared/campus-information-worker.js'

Deno.serve(createInformationWorker(Deno.env.toObject()))
