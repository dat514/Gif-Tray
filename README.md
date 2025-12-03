# 🎨 Tray Animator

Transform your Windows system tray with animated GIF icons! A lightweight Electron app that brings life to your taskbar with smooth, customizable animated icons.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-blue.svg)
![Electron](https://img.shields.io/badge/Electron-Latest-brightgreen.svg)

## ✨ Features

- **🎬 Animated GIF Support** - Display animated GIFs directly in your system tray
- **🖼️ Static Images** - Works with PNG, JPG, and JPEG formats
- **✂️ Built-in Cropper** - Crop and resize your images with an intuitive editor
- **⚡ Performance Modes** - Choose between Light, Balanced, or Performance modes
  - 🪶 **Light Mode**: 15 frames, ~100-150MB RAM
  - ⚖️ **Balanced Mode**: 30 frames, ~150-250MB RAM  
  - ⚡ **Performance Mode**: 60 frames, ~300-500MB RAM
- **📐 Customizable Size** - Adjust tray icon size from 16px to 128px
- **🚀 Startup Support** - Option to run automatically with Windows
- **💾 Persistent Storage** - Your settings and icon are saved automatically
- **🎯 Memory Optimized** - Efficient frame management and garbage collection

## 📦 Installation

### Quick Install (Recommended)

1. Go to the [Releases](../../releases) page
2. Download the latest `Tray-Animator-Setup.exe`
3. Run the installer and follow the setup wizard
4. Launch the app from your desktop or start menu

### Build from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/tray-animator.git
cd tray-animator

# Install dependencies
npm install

# Run in development mode
npm start

# Build for Windows
npm run build
```

## 🚀 Usage

### Getting Started

1. **Launch the app** - The tray icon will appear in your system tray
2. **Right-click the tray icon** and select **"🛠️ Open Editor"**
3. **Select an image** by clicking **"📂 Select Image"**
4. **Crop your image** using the interactive cropper
5. **Choose performance mode** based on your preference
6. **Adjust the size** (default: 32px)
7. **Click "💾 Save & Apply"** to update your tray icon

### Performance Modes

- **Light**: Best for low-end systems or battery saving
- **Balanced**: Recommended for most users (default)
- **Performance**: Maximum smoothness for high-end systems

### Supported Formats

- **GIF** (animated or static)
- **PNG** (with transparency support)
- **JPG/JPEG**

## 🎛️ Configuration

Settings are automatically saved in:
```
%APPDATA%/tray-animator/settings.json
```

Processed icons are stored in:
```
%APPDATA%/tray-animator/tray-icon.processed
```

## 🔧 Technologies

- **[Electron](https://www.electronjs.org/)** - Cross-platform desktop framework
- **[gifuct-js](https://github.com/matt-way/gifuct-js)** - GIF parsing and decompression
- **[gif-encoder-2](https://github.com/benjaminadk/gif-encoder-2)** - GIF encoding
- **[node-canvas](https://github.com/Automattic/node-canvas)** - Image processing
- **[Cropper.js](https://fengyuanchen.github.io/cropperjs/)** - Interactive image cropping

## 📋 Requirements

- **OS**: Windows 7 or later
- **RAM**: Minimum 512MB (varies by performance mode)
- **Disk**: ~100MB for installation

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🐛 Known Issues

- First frame is used for cropping preview when working with GIFs
- Performance mode changes require re-saving the icon

## 🔮 Roadmap

- [ ] Multiple tray icon profiles
- [ ] Custom animation speed control
- [ ] Drag & drop support
- [ ] macOS and Linux support
- [ ] Icon library/presets

## 👤 Author

**dat514**

## 🙏 Acknowledgments

- Thanks to all contributors and users
- Inspired by the need for customizable system tray icons

---

<div align="center">

⭐ Star this repo if you find it useful!
</div>
