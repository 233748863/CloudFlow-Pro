package com.cloudflow.auth.utils;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.geom.GeneralPath;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.Random;

public class SliderPuzzleUtil {

    private static final int WIDTH = 300;
    private static final int HEIGHT = 150;
    private static final int SLIDER_WIDTH = 50;
    private static final int SLIDER_HEIGHT = 50;
    private static final int CIRCLE_R = 6;

    public static class CaptchaData {
        private String bgImage;
        private String sliderImage;
        private int x;
        private int y;

        // Getters and Setters
        public String getBgImage() { return bgImage; }
        public void setBgImage(String bgImage) { this.bgImage = bgImage; }
        public String getSliderImage() { return sliderImage; }
        public void setSliderImage(String sliderImage) { this.sliderImage = sliderImage; }
        public int getX() { return x; }
        public void setX(int x) { this.x = x; }
        public int getY() { return y; }
        public void setY(int y) { this.y = y; }
    }

    public static CaptchaData createCaptcha() {
        CaptchaData data = new CaptchaData();
        Random random = new Random();

        // 1. Generate Background
        BufferedImage bg = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_RGB);
        Graphics2D gBg = bg.createGraphics();
        
        // Dynamic Gradient Background
        Color c1 = new Color(random.nextInt(255), random.nextInt(255), random.nextInt(255));
        Color c2 = new Color(random.nextInt(255), random.nextInt(255), random.nextInt(255));
        GradientPaint gp = new GradientPaint(0, 0, c1, WIDTH, HEIGHT, c2);
        gBg.setPaint(gp);
        gBg.fillRect(0, 0, WIDTH, HEIGHT);
        
        // Add Noise/Shapes
        for (int i = 0; i < 20; i++) {
            gBg.setColor(new Color(random.nextInt(255), random.nextInt(255), random.nextInt(255), 100));
            int r = random.nextInt(50);
            gBg.fillOval(random.nextInt(WIDTH), random.nextInt(HEIGHT), r, r);
        }

        // 2. Determine Slider Position
        int targetX = SLIDER_WIDTH + random.nextInt(WIDTH - 2 * SLIDER_WIDTH);
        int targetY = random.nextInt(HEIGHT - SLIDER_HEIGHT);
        data.setX(targetX);
        data.setY(targetY);

        // 3. Create Slider Image (Transparent)
        BufferedImage slider = new BufferedImage(SLIDER_WIDTH, SLIDER_HEIGHT, BufferedImage.TYPE_INT_ARGB);
        Graphics2D gSlider = slider.createGraphics();

        // 4. Define Puzzle Shape
        GeneralPath path = new GeneralPath();
        path.moveTo(0, 0);
        path.lineTo(SLIDER_WIDTH / 2 - CIRCLE_R, 0);
        path.quadTo(SLIDER_WIDTH / 2, -CIRCLE_R, SLIDER_WIDTH / 2 + CIRCLE_R, 0); // Top tab (up)
        path.lineTo(SLIDER_WIDTH, 0);
        path.lineTo(SLIDER_WIDTH, SLIDER_HEIGHT / 2 - CIRCLE_R);
        path.quadTo(SLIDER_WIDTH + CIRCLE_R, SLIDER_HEIGHT / 2, SLIDER_WIDTH, SLIDER_HEIGHT / 2 + CIRCLE_R); // Right tab (out)
        path.lineTo(SLIDER_WIDTH, SLIDER_HEIGHT);
        path.lineTo(0, SLIDER_HEIGHT);
        path.lineTo(0, SLIDER_HEIGHT / 2 + CIRCLE_R);
        path.quadTo(CIRCLE_R, SLIDER_HEIGHT / 2, 0, SLIDER_HEIGHT / 2 - CIRCLE_R); // Left tab (in)
        path.closePath();

        // 5. Cut Slider from BG
        // Clip the slider graphics to the path
        gSlider.setClip(path);
        // Draw the relevant part of bg onto slider
        gSlider.drawImage(bg, -targetX, -targetY, null);
        
        // Add border/stroke to slider
        gSlider.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        gSlider.setColor(new Color(255, 255, 255, 200));
        gSlider.setStroke(new BasicStroke(2));
        gSlider.draw(path);

        // 6. Draw Hole on BG
        gBg.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        // Translate to target position
        gBg.translate(targetX, targetY);
        gBg.setColor(new Color(0, 0, 0, 150)); // Dark overlay
        gBg.fill(path);
        gBg.setColor(new Color(255, 255, 255, 100)); // Slight border for visibility
        gBg.setStroke(new BasicStroke(1));
        gBg.draw(path);

        gBg.dispose();
        gSlider.dispose();

        // 7. Encode
        try {
            data.setBgImage(toBase64(bg));
            data.setSliderImage(toBase64(slider));
        } catch (IOException e) {
            e.printStackTrace();
        }

        return data;
    }

    private static String toBase64(BufferedImage image) throws IOException {
        ByteArrayOutputStream os = new ByteArrayOutputStream();
        ImageIO.write(image, "png", os);
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(os.toByteArray());
    }
}
