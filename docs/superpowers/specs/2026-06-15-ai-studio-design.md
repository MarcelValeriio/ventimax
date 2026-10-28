# AI Studio Design Spec

## 1. Overview
The AI Studio is a new module within the Pachi-Kid SaaS platform that allows administrators to generate images using DALL-E 3, generate accompanying copy using DeepSeek, and distribute this content directly to configured WhatsApp numbers. This tool is designed to facilitate social media content creation and internal distribution.

## 2. Architecture & Data Flow

### 2.1. Backend Isolation
To ensure the new AI generation features do not block the existing WhatsApp bot's event loop, heavy tasks will be offloaded:
- Image generation (DALL-E 3 API call).
- Image hosting (Cloudinary upload).
- Background queue management will be handled by `agenda` backed by the existing MongoDB connection.

### 2.2. Database Models (MongoDB)
- **`AIDestination`**: Stores the manual contacts configured to receive the content.
  - `name` (String)
  - `phone` (String, sanitized)
- **`AIGeneration`**: Acts as a persistent history gallery for the session and past sessions.
  - `imagePrompt` (String)
  - `imageUrl` (String, pointing to Cloudinary)
  - `copyText` (String)
  - `createdAt` (Date)

### 2.3. API Endpoints
All routes will be prefixed with `/api/admin/ai-studio` to maintain modularity.
- `GET /destinations` - List saved broadcast contacts.
- `POST /destinations` - Add a new contact.
- `DELETE /destinations/:id` - Remove a contact.
- `GET /history` - Fetch previous `AIGeneration` records for the gallery.
- `POST /generate-image` - Triggers DALL-E 3 and Cloudinary upload.
- `POST /generate-copy` - Triggers DeepSeek for copy generation based on user instructions.
- `POST /broadcast` - Sends the selected image and copy to all `AIDestinations` using the existing `whatsapp.js` service.

## 3. User Interface (Frontend)

### 3.1. Layout
A dedicated "AI Studio" view accessible from the new "Config" sidebar menu (or as a standalone tab, depending on routing preference, but entirely isolated from the Chat/Inventory views).
- **Left Sidebar**: 
  - Recipient Management (CRUD for WhatsApp numbers).
  - Image Generator Input (Textarea for DALL-E 3 prompt and generate button).
- **Main Content Area**:
  - **Top**: Horizontal scrolling gallery of past generations (`AIGeneration` history).
  - **Center Left**: Large preview of the currently selected or newly generated image.
  - **Center Right**: "Copy Generator" panel.
    - Input for custom instructions (e.g., "make it funny", "include 20% off").
    - Button to trigger DeepSeek.
    - Display area for the generated copy.
  - **Bottom Action**: A prominent "Send to WhatsApp" button that distributes the image + copy to the recipients.

### 3.2. Constraints & Validation
- **WhatsApp Caption Limit**: The frontend will enforce a strict 1,024 character limit on the generated/edited copy. If the text exceeds this, the "Send to WhatsApp" button will be disabled, and a visual warning will be displayed.

## 4. Dependencies
- `agenda` (npm package) for background job processing via MongoDB.
- `openai` (npm package) for DALL-E 3 and DeepSeek integration.
- Existing `cloudinary` integration for persistent image hosting.