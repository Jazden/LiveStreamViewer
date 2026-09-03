# LiveStreamViewer Project Guidelines

## Overview
LiveStreamViewer is a web application for viewing, managing, and synchronizing live streams (YouTube links, live stream URLs) across primary and secondary displays, with mobile remote control capabilities via QR code linking.

## Project Structure
- `index.html`: Main viewer interface and layout engine.
- `app.js`: Core application logic, layout management, stream synchronization, and player integration.
- `streams.js`: Default stream definitions and stream data configuration.
- `style.css`: Main styling, responsive grid layouts, and visual controls.
- `mobile/`: Mobile controller interface for remote controlling streams and layouts via linked sessions.
- `tv/`: TV / big-screen optimized viewer interface.

## Tech Stack & Conventions
- Pure modern HTML5 / CSS3 / Vanilla JavaScript (ES6+).
- Client-side state persistence using LocalStorage.
- Cross-device communication and display pairing.
