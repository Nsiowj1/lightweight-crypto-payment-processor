

# Product Requirements Document (PRD) for Lightweight Crypto Payment Processor

## 1. Purpose and Scope

Provide a lightweight, self-hosted cryptocurrency payment processor supporting BTC, LTC, BNB, SOL, ETH, USDT, and USDC, deployable on Render’s free tier with Supabase and Upstash Redis. Ensure 24/7 availability via free keep-alive strategies, zero transaction fees, and easy merchant integration.

## 2. Key Features

**2.1 Core Payment Processing**

- Multi-chain address generation (HD wallets) for BTC, LTC, ETH, BNB, SOL
- Support for USDT (ERC-20, BEP-20, TRC-20) and USDC (ERC-20, BEP-20)
- Invoice creation, expiration, and tracking
- Webhook notifications for payment status

**2.2 Infrastructure \& Hosting**

- **Supabase**: PostgreSQL database (500MB free) with real-time subscriptions
- **Upstash Redis**: 256MB data, 500K commands/month for caching and rate limiting
- **Render**: 512MB RAM, 0.1 vCPU, 750 hours/month for API and frontend hosting
- Health check endpoint for uptime and service validation
- Keep-alive via Cron-job.org (14-minute interval) with UptimeRobot backup

**2.3 Security \& Compliance**

- API key authentication for merchants
- Row Level Security and JWT for data access
- Input validation, rate limiting, and CORS policies
- Webhook signature verification
- TLS encryption for all services

**2.4 Developer Experience**

- Auto-generated REST API from Supabase
- Git-based deployments on Render
- Dockerfile and `render.yaml` for reproducible builds
- Comprehensive API documentation and Postman collection


## 3. User Stories

1. **Merchant Registration**
    - As a merchant, I can register an account and receive an API key to start accepting crypto payments.
2. **Payment Creation**
    - As a merchant, I can create a payment request specifying amount, currency, and order ID.
3. **Payment Monitoring**
    - As a merchant, I can query payment status via API or receive webhook updates.
4. **Dashboard**
    - As a merchant, I can view a dashboard of recent payments, balances, and webhooks.
5. **Health \& Uptime**
    - As an operator, I can monitor service health and resource usage to ensure SLAs are met.

## 4. Milestones \& Roadmap

| Phase | Timeline | Deliverables |
| :-- | :-- | :-- |
| Phase 1: Foundation | Week 1 (Days 1–7) | -  Supabase project with schema<br>-  Express.js API skeleton<br>-  Render deployment setup<br>-  Upstash Redis integration |
| Phase 2: Core Payments | Week 2 (Days 8–14) | -  HD wallet address generation<br>-  Payment creation and tracking<br>-  Webhook handlers<br>-  Frontend: basic invoice form |
| Phase 3: Keep-Alive \& Monitoring | Week 3 (Days 15–21) | -  Health check endpoint<br>-  Cron-job.org keep-alive integration<br>-  UptimeRobot setup<br>-  Usage monitoring endpoint |
| Phase 4: Advanced Features | Week 4 (Days 22–28) | -  Multi-chain USDT/USDC support<br>-  WebSocket real-time updates<br>-  Merchant dashboard enhancements<br>-  API documentation |
| Phase 5: Security \& Hardening | Week 5 (Days 29–35) | -  Input validation \& rate limiting<br>-  Webhook signature verification<br>-  TLS \& CORS configuration<br>-  Penetration testing |
| Phase 6: Testing \& Launch | Week 6 (Days 36–42) | -  Unit, integration, \& load tests<br>-  Documentation completion<br>-  Final performance tuning<br>-  Public launch |

## 5. Technical Dependencies

- Supabase account and service key
- Upstash Redis REST URL and token
- Render account with external hostname
- Blockchain API providers (Ankr, BlockCypher, Blockstream, Solana RPC)
- Environment variables for secrets and API keys


## 6. Success Metrics

- **Availability**: 99.9% uptime within free tier constraints
- **Performance**: ≤500ms average API response time
- **Cost**: \$0 infrastructure cost during MVP phase
- **Adoption**: 50 merchants onboarded within first month
- **Transactions**: 1,000 successful transactions processed in month one


## 7. Risk \& Mitigation

| Risk | Mitigation |
| :-- | :-- |
| Render instance sleeping/vacuuming | Cron-job.org keep-alive + UptimeRobot backup; self-ping fallback integrated |
| Exceeding free tier resource limits | Monitor resource usage; alert on 80% threshold; move to paid Render Starter plan if needed |
| API rate limit from blockchain providers | Implement caching, rate limiting, circuit breakers; rotate between multiple providers |
| Security vulnerabilities | Conduct regular security audits; implement OWASP best practices; enable Supabase RLS |

## 8. Next Steps

1. Finalize environment and API key procurement
2. Assign developers to Phase 1 tasks
3. Set up project repository, CI/CD pipelines, and documentation templates
4. Kick off development on next business day

---
This PRD outlines all the requirements, features, and a clear roadmap to deliver a fully functional, lightweight crypto payment processor on free hosting tiers. Let’s get started!

