-- Migration: Add expert_advisor to profiles.app_role check constraint
-- Run this once in your Supabase SQL editor.
--
-- This safely drops the existing check constraint and recreates it
-- with expert_advisor added, preserving all existing allowed values.

-- Step 1: Drop the existing constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_app_role_check;

-- Step 2: Recreate with expert_advisor included
-- Covers all known existing values + expert_advisor
ALTER TABLE profiles
  ADD CONSTRAINT profiles_app_role_check
  CHECK (app_role IN (
    'super_admin',
    'admin',
    'expert_advisor',
    'advisor',
    'owner',
    'team_member',
    'user'
  ));