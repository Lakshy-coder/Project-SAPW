import request from 'supertest';
import { app } from './src/index';

async function runDemo() {
  console.log('--- STARTING LIVE DEMO ---');
  
  const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  const token = loginRes.body.session.token;
  
  console.log('1. Created session successfully.');

  const quickIntent = '2+2';
  const quickReq = {
    intent: quickIntent,
    capabilities: ['GENERAL_REASONING'],
    rawRequest: {}
  };
  
  const quickRes = await request(app).post('/api/jobs').set('Authorization', `Bearer ${token}`).send(quickReq);
  const quickJobId = quickRes.body.id;
  
  console.log(`2. Created Quick Job ${quickJobId}`);
  
  let quickFinal: any = null;
  while (true) {
    await new Promise(r => setTimeout(r, 500));
    const res = await request(app).get(`/api/jobs/${quickJobId}`).set('Authorization', `Bearer ${token}`);
    quickFinal = res.body;
    if (quickFinal.status !== 'QUEUED' && quickFinal.status !== 'RUNNING') break;
  }
  console.log(`3. Quick Job finished. Result: ${quickFinal.result?.answer || quickFinal.result}`);
  
  const intent = 'Calculate pipe wall thickness using the applicable ASME requirements and the available SOP/reference. Show the deterministic calculation, relevant source evidence, assumptions, verification, and final result.';
  
  const jobReq = {
    intent,
    capabilities: ['ASME_CALCULATION', 'SOP_RETRIEVAL', 'GENERAL_REASONING'],
    rawRequest: { designPressureMPa: 1.5, outsideDiameterMM: 200, allowableStressMPa: 100, weldJointFactor: 1, yCoefficient: 0.4 }
  };
  
  const createRes = await request(app).post('/api/jobs').set('Authorization', `Bearer ${token}`).send(jobReq);
  const jobId = createRes.body.id;
  
  console.log(`2. Created Job ${jobId}`);
  
  let final: any = null;
  while (true) {
    await new Promise(r => setTimeout(r, 500));
    const res = await request(app).get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${token}`);
    final = res.body;
    if (final.status !== 'QUEUED' && final.status !== 'RUNNING') break;
  }
  
  console.log(`3. Job finished with status: ${final.status}`);
  
  const asmeNode = final.nodes.find((n: any) => n.type === 'ASME_CALCULATION');
  console.log(`4. ASME_CALCULATION -> ${asmeNode.state}`);
  
  const sopNode = final.nodes.find((n: any) => n.type === 'SOP_RETRIEVAL');
  console.log(`5. SOP_RETRIEVAL -> ${sopNode.state}`);
  
  const reasoningNode = final.nodes.find((n: any) => n.type === 'REASONING');
  console.log(`6. REASONING -> ${reasoningNode.state}`);
  
  const verifyNode = final.nodes.find((n: any) => n.type === 'VERIFICATION_GATE');
  console.log(`7. VERIFICATION_GATE -> ${verifyNode.state}`);
  
  console.log('8. FINAL RESULT:');
  console.log(final.result?.answer || final.result);
  console.log('--- DEMO COMPLETE ---');
  
  // Close everything if needed
  process.exit(0);
}

runDemo().catch(console.error);
