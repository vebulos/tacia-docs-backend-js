# TaciaDocs API Server (Node.js)

[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)](https://expressjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

RESTful API server for TaciaDocs, built with Node.js. This is the JavaScript backend implementation that powers the TaciaDocs documentation portal.

## 📚 Documentation

Explore our detailed documentation to understand, use, and contribute to the project:

### 📋 Overview
- [Project Overview](docs/01-overview.md)
- [API Reference](docs/03-api-reference.md)
- [Technical Architecture](docs/04-technical-architecture.md)
- [API Design](docs/07-api-design.md)
- [Performance Optimization](docs/08-performance-optimization.md)
- [Security Guide](docs/09-security-guide.md)
- [Testing Strategy](docs/10-testing-strategy.md)
- [Deployment Guide](docs/11-deployment-guide.md)

## 🚀 Quick Start

### Prerequisites
- Node.js 18.x or higher
- npm 9.x or higher

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/vebulos/tacia-docs-backend-js.git
   cd tacia-docs-backend-js
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Update the variables in .env as needed
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```
   The API will be available at `http://localhost:4201/api`

## 🔄 Working with Frontend

This backend is designed to work with the TaciaDocs frontend. To run both together:

1. Start the backend server:
   ```bash
   cd tacia-docs-backend-js
   npm run dev
   ```

2. In a separate terminal, start the frontend:
   ```bash
   git clone https://github.com/vebulos/tacia-docs.git
   cd tacia-docs
   npm start
   ```

3. Access the application at `http://localhost:4200`

## 📦 Features

- RESTful API for content management
- Markdown content processing
- Hierarchical document structure
- Full-text search capabilities
- OpenAPI documentation
- File upload and management
- Internationalization support

## 🛠 Tech Stack

- **Runtime**: Node.js 18+
- **API**: RESTful JSON API
- **Documentation**: OpenAPI/Swagger
- **Testing**: Vitest

## 🧪 Testing

Run the test suite:
```bash
npm test
```

## 🐳 Docker Support

Build and run with Docker:
```bash
docker-compose up --build
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
